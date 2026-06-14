# PIR Plan: Tower terminal freeze (CPU-bound listener/session accumulation)

> Issue #1047. Tower terminals (architects + builders) become non-responsive until `afx tower stop && afx tower start`.

## Understanding

Over ~10 hours of Tower uptime, Tower's CPU climbs roughly linearly (0.6% at t=3m to 93% at t=10h) and every PTY terminal stops rendering output at once. A default (non-force) `afx tower stop && afx tower start` restores responsiveness; force-kill of shellpers is not involved. The diagnostic comments establish:

- The event loop is alive (SSE heartbeats fire on schedule every 30s), so this is not a deadlock. CPU saturation is starving message delivery, which is why clients eventually fail keepalive and terminals look frozen.
- Memory grows only +76 MB over 10h and FDs grow by ~9, both minor. This rules out the GC-stall / memory-bloat mechanism. The load-bearing signal is **CPU**.
- The cron firing path and the SSE pump itself were already ruled out by the reporter (cron is bursty/bounded; the SSE pump at `tower-server.ts:192-262` is well-defended).
- The SSE-client churn visible in the logs is partly **by design**: the heartbeat evicts SSE connections older than `SSE_MAX_AGE_MS` (5 min) so clients reconnect (`tower-server.ts:234-262`). That churn is a symptom amplifier, not the root cause.

The shape that fits all of this is **a per-data-frame or per-tick hot path doing work proportional to a growing in-memory collection** (an EventEmitter listener set, or a list/map iterated on every PTY byte burst). The regression window points at PIR #991 (terminal reconnect / successor-session resolution), whose reconnect cycles are the classic listener-accumulation surface.

### What the code review found (grounded, but not yet runtime-confirmed)

The hot path per PTY byte burst is `PtySession.onPtyData` (`packages/codev/src/terminal/pty-session.ts:251-281`): it pushes to the ring buffer, writes the disk log, iterates `this.clients`, and emits `'data'`. It is fed by the shellper `client.on('data', ...)` subscription installed in `attachShellper` (`pty-session.ts:142`). Two latent hazards make this path able to inflate with uptime:

1. **`createSessionRaw` overwrites without teardown.** `PtyManager.createSessionRaw` (`packages/codev/src/terminal/pty-manager.ts:126-163`) ends with `this.sessions.set(id, session)` and never tears down a pre-existing entry under the same `id`. Its inline comment argues "the in-memory sessions map is empty at reconcile time, so reusing the id can't collide" — but that reasoning holds only for the **startup** reconcile, not for the **on-the-fly** reconnect path (`tower-terminals.ts:923`) which runs while Tower is live and the map is populated.

2. **`attachShellper` adds listeners with no prior-listener removal.** `attachShellper` (`pty-session.ts:119-197`) installs `data`, `exit`, and `close` listeners on the shellper client and, in the `restartOnExit` branch, additional `data` listeners (`pty-session.ts:163-179`). `detachShellper` (`pty-session.ts:228-234`) does `removeAllListeners()`, but it is only invoked on Tower shutdown — not when an on-the-fly reconnect replaces a PtySession. If an **old** PtySession is dropped from the manager map while its old shellper client (or any closure capturing it) stays referenced, the old `data` listener keeps firing `onPtyData`, doubling the work per byte. Repeat across reconnect cycles and the per-byte cost grows.

The on-the-fly reconnect path (`tower-terminals.ts:860-958`) is guarded by `!session`, so under normal operation it fires once per lost-session window — not on every poll. **This means static analysis cannot prove this is the production trigger.** The exact accumulation cadence only manifests after hours of real use, so the honest position is: this is the highest-confidence *candidate*, and the plan must both (a) harden it safely and (b) instrument Tower so the next occurrence is captured with hard data rather than inferred.

## Proposed Change

A three-part change, investigation-first so we confirm the mechanism rather than guess, paired with safe hardening and a fast regression test that compresses the 10-hour leak into CI.

### Part A — Bounded, always-on instrumentation (confirm the mechanism)

Add a cheap periodic self-report, hosted on the existing 30s SSE heartbeat interval (`tower-server.ts:236`) so it adds no new timer. Each tick logs a single structured line capturing the collections most likely to grow:

- Total live `PtySession` count and total live `ShellperClient` count.
- Per-session `data` / `exit` / `close` listener counts on the shellper client (via `emitter.listenerCount(event)`), and the session's WebSocket `clientCount`.
- Total terminal WebSocket connection count and total SSE client count.
- Tower's own CPU since the last tick via `process.cpuUsage()` delta, normalized to a percentage.

When any per-client listener count crosses a small threshold (for example > 5), emit a `WARN` naming the offending terminal id. This is O(number of sessions) once per 30s — negligible — and it directly confirms or refutes the listener-accumulation hypothesis and pins *which* collection grows. The reviewer can watch these lines live at the `dev-approval` gate, and they remain in production logs to catch the next real occurrence if the hardening below turns out incomplete.

### Part B — Defensive hardening (safe regardless of whether it is THE cause)

1. **Make PtySession replacement under a reused id non-leaking.** Before `createSessionRaw` (and the on-the-fly reconnect path) installs a new PtySession under an existing id, tear down any prior PtySession bound to that id: detach it from its shellper client (`removeAllListeners` on the old client) and clear its WebSocket clients/timers. Concretely, give `PtyManager` a guarded replace that calls the existing teardown (`detachShellper` / `cleanup`) on a colliding entry instead of silently overwriting the map.

2. **Make `attachShellper` idempotent.** If `attachShellper` is called when a previous shellper client is still attached (or re-called on the same session), remove the previously-installed `data` / `exit` / `close` listeners from the old client first, so a re-attach cannot double the per-byte fan-out.

3. **Add a `setMaxListeners` tripwire** on the shellper client (a small bound, for example 12) so any future accumulation surfaces as Node's native "possible EventEmitter memory leak" warning in the Tower log rather than silently degrading CPU.

These three are correct in their own right (a replaced/re-attached session should never keep firing old listeners), so they are safe to land even if the production trigger turns out to be a different collection — in which case Part A's instrumentation tells us where to look next.

### Part C — Accelerated repro test (capture data, not speculation)

Add a unit/integration test that drives many reconnect/re-attach cycles against a fake in-memory shellper client and asserts that, after N cycles, (a) the shellper client's `data`/`exit`/`close` listener counts stay bounded, (b) the live `PtySession` count stays bounded, and (c) a single emitted data frame is processed exactly once (not N times). This compresses the 10-hour leak into a deterministic test and is what the `dev-approval` reviewer and CI run to verify the fix without waiting 10 hours.

## Files to Change

- `packages/codev/src/terminal/pty-session.ts` — make `attachShellper` idempotent (remove prior client listeners before re-subscribing); add `setMaxListeners` tripwire on the shellper client. (`attachShellper` ~119-197; `detachShellper` ~228-234.)
- `packages/codev/src/terminal/pty-manager.ts:126-163` — `createSessionRaw`: tear down any pre-existing PtySession under the same id before `this.sessions.set(...)`; update the now-inaccurate "can't collide" comment.
- `packages/codev/src/agent-farm/servers/tower-terminals.ts:860-958` — on-the-fly reconnect: ensure the replaced session is explicitly detached/torn down (belt-and-suspenders with the PtyManager change above).
- `packages/codev/src/agent-farm/servers/tower-server.ts:236-262` — add the bounded per-tick instrumentation onto the existing SSE heartbeat (or a sibling `.unref()`'d interval if cleaner), plus a small CPU-delta helper.
- `packages/codev/src/terminal/__tests__/` (and/or `packages/codev/src/agent-farm/__tests__/`) — new accelerated reconnect/listener-bound regression test.

Final file list to be confirmed during implementation; the instrumentation may warrant a tiny helper module rather than inlining into `tower-server.ts`.

## Risks & Alternatives Considered

- **Risk: the hardening does not fix the production trigger** (the real growing collection is elsewhere). Mitigation: Part A's instrumentation is the safety net — it ships regardless and pins the true collection on the next occurrence. The hardening is independently correct, so it does no harm.
- **Risk: tearing down a replaced session detaches a still-needed live client.** Mitigation: only tear down when the id genuinely collides with a *different* PtySession instance, and route through the existing `detachShellper` (which already exists for the shutdown path) so semantics match a known-safe teardown. The accelerated test asserts a live data frame still reaches exactly one consumer after re-attach.
- **Risk: `setMaxListeners(12)` warns on a legitimately high fan-out.** Mitigation: the bound is a tripwire for logs only (Node warns, does not throw); tune if a legitimate case exceeds it.
- **Alternative considered — pure "instrument and wait" (no hardening).** Rejected: the listener/teardown gaps are real latent bugs worth fixing now, and shipping the fix plus the instrument is strictly better than shipping the instrument alone.
- **Alternative considered — bisect v3.1.5..v3.1.7 to pin the regression PR first.** Rejected as the *primary* path because it needs a 12h+ soak per candidate and does not produce a fix; the instrumentation captures the same signal faster and the hardening lands the fix. Bisect remains available as a fallback if Part A's data points away from the reconnect surface.

## Test Plan

The reviewer exercises this at the `dev-approval` gate against the running worktree:

- **Unit/integration (fast, deterministic):** run the new accelerated reconnect test — `pnpm --filter @cluesmith/codev test` from the worktree. It must show listener and session counts staying bounded across many cycles, and a single data frame processed exactly once.
- **Full suite:** `pnpm --filter @cluesmith/codev test` (and `pnpm --filter @cluesmith/codev build`) green, run from the worktree (not the main checkout).
- **Manual / live observability:** start the worktree's Tower (`afx dev <builder-id>` or a local Tower start against this branch), open a couple of architect/builder terminals, and confirm the new per-tick instrumentation line appears every 30s in `afx tower log -f` with sane, *stable* counts (listener counts staying at their baseline, not climbing) as terminals are opened, closed, and reconnected. Force a few terminal WS reconnects (close/reopen the VSCode tab) and confirm per-session listener counts return to baseline rather than incrementing.
- **Soak (optional, post-merge / verify):** leave Tower running for several hours on a real workload and confirm CPU stays low and the instrumentation counts stay flat. This is the true end-to-end confirmation; it is noted here for completeness but is not gating for the PR since it cannot fit a gate session.

## Open Question for the Reviewer

If you want this scoped more tightly, the two natural cut points are: (1) ship **only** Part A + Part C now (instrument + test, no behavior change) and use the captured data to target a follow-up fix, or (2) ship all three parts as proposed. I recommend (2) because the hardening is independently correct and low-risk, but the choice is yours at the gate.
