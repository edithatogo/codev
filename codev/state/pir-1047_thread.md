# PIR #1047 — Tower terminals freeze until restart

## Phase: plan (in progress)

### Investigation summary
- Symptom (from issue + 4 diagnostic comments): CPU climbs linearly with uptime (0.6% → 93% over ~10h), ALL PTY terminals freeze, restart fixes it, memory grows only +76MB (minor), FD growth glacial. SSE clients churn/marked-dead is a *secondary* symptom of CPU starvation (and SSE 5-min max-age eviction is by-design, not the bug).
- Leak-shape: CPU-bound work proportional to a growing in-memory collection, iterated on a per-data-frame or per-tick hot path. Regression window points at PIR #991 (terminal reconnect / successor-session resolution).
- Comments already ruled out: cron firing (bursty, bounded), the SSE pump itself (well-defended), GC-stall/memory mechanism (RSS minor).

### Code findings (grounded)
- `PtySession.onPtyData` (pty-session.ts:251-281) is the per-data-frame hot path: pushes ring buffer, writes disk log, iterates `this.clients`, emits `'data'`. The shellper `client.on('data')` fan-out (attachShellper, pty-session.ts:142) feeds it.
- HAZARD 1: `createSessionRaw` (pty-manager.ts:126-163) does `this.sessions.set(id, session)` with NO teardown of a pre-existing entry under the same id. Its safety comment ("map is empty at reconcile time, can't collide") only holds at startup reconcile, NOT the on-the-fly reconnect path (tower-terminals.ts:923) which runs live.
- HAZARD 2: `attachShellper` (pty-session.ts:119-197) adds `data`/`exit`/`close` listeners to the shellper client with no prior-listener removal; nothing explicitly detaches the OLD PtySession from its OLD client on reconnect (relies on GC, which fails if the old client stays referenced/alive).
- On-the-fly reconnect (tower-terminals.ts:860-958) is guarded by `!session`, so it fires once per lost-session window (NOT every poll — the subagent over-claimed "every poll"). Exact trigger for repeated accumulation is not confirmable by static read alone.

### Plan direction
Investigation-first + defensive hardening + accelerated repro test + bounded always-on instrumentation. Root cause is not confidently pinned statically (only manifests after ~10h), so the plan instruments to confirm on next occurrence AND lands safe hardening + a fast test that compresses the 10h leak into CI.

Plan written to codev/plans/1047-tower-terminals-architects-bui.md — awaiting plan-approval gate.
