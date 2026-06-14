# PIR Plan: Tower terminal freeze — unbounded no-newline buffers (O(n²) output pump)

> Issue #1047. Tower terminals (architects + builders) become non-responsive over time; the only known recovery is a Tower restart, and even that is **not reliably** effective.

## Understanding

### Root cause (empirically confirmed)

Tower's per-PTY-frame hot path re-scans an **unbounded, newline-delimited buffer** on every byte burst. A full-screen TUI (Claude Code's prompt/UI) runs in the alternate screen buffer and redraws **in place** using cursor-addressing and carriage returns, emitting almost **no `\n` bytes**. Two buffers in the output path bound themselves by newline count and therefore never bound at all for such a stream:

1. **`RingBuffer.partial`** (`packages/codev/src/terminal/ring-buffer.ts:36-51`). `pushData` does `const combined = this.partial + data; combined.split('\n')` and saves the trailing fragment back into `this.partial`. With no `\n` in the stream, `partial` grows without limit, and **every frame re-concatenates and re-splits the entire accumulated buffer** — O(partial) per frame, O(n²) over the session. There is no byte cap on `partial` (confirmed: the only byte cap in the terminal layer is the *stderr* ring buffer's `maxLineLength = 10000` at `session-manager.ts:67` — the main RingBuffer never got one).
2. **`ShellperReplayBuffer`** (`packages/codev/src/terminal/shellper-replay-buffer.ts:45,58`) on the shellper side. It evicts only `while (this.lineCount > this.maxLines …)`. With zero newlines, `lineCount` stays 0, eviction never fires, and `chunks` grows unbounded. Every PTY chunk is appended here (`shellper-process.ts:143`).

### Empirical evidence

Measuring the on-disk PTY logs (`~/.agent-farm/logs/*.log`, raw terminal output) across real sessions:

| Session log | Size | Newlines | Longest run without `\n` |
|---|---|---|---|
| `f02bedcb…` (14 Jun 21:01, **incident window**) | 15 MB | **0** | **14.57 MB (entire file)** |
| `d8406afb…` | 24 MB | 1,215,838 | 5,295 bytes |
| `4d5523cb…` | 20 MB | 1,098,370 | 7,596 bytes |

The incident-window session emitted **15 MB with not a single newline**. Byte census of that file: 1,500,892 ESC (`0x1b`), 164,652 CR (`0x0d`), 0 LF — a control-heavy redraw stream (`\e[?1049h \e[2J \e[H \e[?25l … \e[3G \e[5G … \r`). For that session, Tower's `partial` grows to ~15 MB and every incoming frame re-splits ~15 MB. Other sessions (normal newline density, ~20 bytes/line) are unaffected — which is exactly why the bug is intermittent and session-dependent.

### Why this matches every observation

- **CPU climbs ~linearly with uptime, then ~93% (one core saturated).** `partial` length grows ∝ uptime for an actively-redrawing TUI; per-frame cost ∝ `partial`; frame rate roughly constant → CPU ∝ uptime. Node is single-threaded, so one saturating session pegs ~one core. (Note: the "linear" framing rests on two CPU samples; this mechanism is consistent with a linear climb, and also with a faster ramp once a heavy session starts — both fit.)
- **ALL terminals freeze at once.** The O(n²) re-scan runs on the single shared event loop. One heavy session starves every other terminal's I/O behind it.
- **Memory grows only modestly (+76 MB / 10h).** The cost is CPU (repeated scan + GC churn from re-allocating multi-MB strings each frame), not retained memory. The live `partial`s plus GC headroom account for the modest RSS rise.
- **Input still propagates while render-back is broken** (the issue's stray-`e` screenshot). Writing input is O(small) and occasionally slips through; the output pump's O(partial) re-scan dominates and stalls rendering.
- **Restart is NOT reliably effective.** This is the key point in your question. `ShellperReplayBuffer` is *also* unbounded for no-newline streams, so on restart the shellper replays the full ~15 MB, Tower seeds a fresh `partial` from it, and the O(n²) re-scan resumes almost immediately if the heavy session is still redrawing. Restart only "fixes" it when the offending session has gone quiet or ended. That session-dependence is why you're not sure the restart resolves it.

### Pathway walk-through (where responsiveness can break)

Output (render-back) path, which is the broken direction:

1. **Shellper:** `pty.onData` → `ShellperReplayBuffer.append(buf)` **[BUG #2: unbounded on no-newline]** → forwards the chunk over the unix socket to Tower (`shellper-process.ts:143-146`).
2. **Tower:** `ShellperClient` parser emits `'data'` → `PtySession.onPtyData` (`pty-session.ts:251-281`): `RingBuffer.pushData` **[BUG #1: O(n²) re-scan + unbounded]**, then a synchronous `fs.writeSync` disk-log per frame **[secondary event-loop blocker]**, then broadcast to WS clients (drops frames when `ws.bufferedAmount ≥ 1 MB` — a symptom under starvation, not a cause), then `emit('data')`.
3. **Client:** WS → VSCode extension terminal client → xterm.js render.

Input path (stays responsive): WS message → `session.write` → `shellperClient.write` → unix socket → shellper → PTY. Small, cheap; consistent with the observed "input gets through, output frozen."

The dominant responsiveness failure is Bug #1 (the O(n²) output re-scan); Bug #2 makes restart unreliable and leaks shellper memory; the per-frame `writeSync` is a smaller additive event-loop cost.

### Status of the earlier listener-leak hypothesis

My first draft led with an EventEmitter listener-accumulation theory on the PIR #991 reconnect surface. After empirical measurement, that is **demoted to a secondary, defensive cleanup**: it does not explain the 15 MB zero-newline artifact, the CPU-without-memory profile, or the restart-unreliability, whereas the buffer mechanism explains all three. There remain real-but-minor listener-hygiene gaps (`createSessionRaw` overwrites `sessions` without teardown at `pty-manager.ts:161`; `attachShellper` re-subscribes without removing prior listeners) which are worth a low-risk guard but are not the headline.

## Proposed Change

### Fix 1 (primary) — stop re-scanning, and byte-cap `RingBuffer.partial`

In `RingBuffer.pushData` (`ring-buffer.ts`):

- **Scan only the incoming `data` for newlines**, not the whole `partial + data`. Walk newline indices in `data`, push completed lines (the current `partial` prefixes only the first), and keep the trailing remainder as the new `partial`. This makes per-frame work O(|data|) instead of O(|partial|) and is **behavior-preserving** for replay (same lines, same partial).
- **Cap `partial` to a max byte length** (e.g. a generous `MAX_PARTIAL_BYTES`, on the order of 256 KB–1 MB — large enough that real lines are never clipped, small enough to bound work/memory). When an unbroken run exceeds the cap, trim the front of `partial` to the last `MAX_PARTIAL_BYTES`. Front-trim (rather than injecting a synthetic `\n`) avoids corrupting a TUI replay with spurious line feeds; the slight loss of the alt-screen-enter prefix self-heals because reconnect triggers a full TUI repaint (resize). The exact cap and trim-vs-segment choice is finalized in implementation and validated at the `dev-approval` gate.

### Fix 2 (primary) — byte-cap `ShellperReplayBuffer`

In `ShellperReplayBuffer.append` (`shellper-replay-buffer.ts`): add a `maxBytes` cap alongside `maxLines` (it already tracks `totalBytes`). Evict oldest chunks while `totalBytes > maxBytes`, with a single-chunk front-trim edge case mirroring the existing line logic. This bounds shellper memory for no-newline streams and, crucially, bounds the REPLAY frame so a restart can no longer re-seed a multi-MB `partial` — making restart-as-recovery deterministic and keeping it cheap.

### Fix 3 (defensive, optional) — listener hygiene

Make `attachShellper` idempotent (remove prior `data`/`exit`/`close` listeners before re-subscribing) and have the on-the-fly reconnect / `createSessionRaw` path tear down any pre-existing PtySession under a reused id before replacing it. Correct in its own right; low risk. Include only if it does not bloat the change — otherwise spin out to a follow-up issue.

### Instrumentation (targeted, cheap)

On the existing 30s SSE heartbeat, log per-session `ringBuffer` partial length and shellper replay byte size, and `WARN` when a partial exceeds a threshold (naming the terminal id). This directly observes the now-known cause and confirms the fix holds in production. Far more targeted than the listener-count instrumentation from the first draft.

### Explicitly out of scope

- Converting the per-frame `fs.writeSync` disk log to async/batched (a smaller, separate optimization — note for a follow-up if profiling after Fix 1 still shows it).
- Any change to default `tower stop` shellper-survival behavior (#274 / #832 / #999 / #991).
- The cron `ReferenceError` (#1048) and the spawn-failure sibling (#1038).

## Files to Change

- `packages/codev/src/terminal/ring-buffer.ts` — `pushData`: scan only `data`; byte-cap `partial`. Add `MAX_PARTIAL_BYTES`.
- `packages/codev/src/terminal/shellper-replay-buffer.ts` — add `maxBytes` cap + byte-based eviction; thread a sane default (and wire `replayBufferLines`/a new bytes option from `shellper-process.ts:97` if needed).
- `packages/codev/src/agent-farm/servers/tower-server.ts:236-262` — bounded per-tick partial/replay-size instrumentation on the SSE heartbeat.
- (optional, Fix 3) `packages/codev/src/terminal/pty-session.ts` (`attachShellper`) and `packages/codev/src/terminal/pty-manager.ts:161` (`createSessionRaw` teardown).
- Tests under `packages/codev/src/terminal/__tests__/` — see Test Plan.

## Risks & Alternatives Considered

- **Risk: byte-trimming `partial` corrupts replay for a no-newline TUI** (loses early escape state). Mitigation: generous cap so only pathological streams are trimmed; reconnect already drives a full repaint; the accelerated test asserts a *normal* newline stream replays byte-identically (no behavior change for the common case). The reviewer validates a live reconnect at the `dev-approval` gate.
- **Risk: the cap is too aggressive and clips legitimately long single lines** (e.g. a 200 KB JSON blob on one line). Mitigation: set the cap well above realistic single-line sizes; it only bounds *pathological* unbroken runs (megabytes).
- **Risk: there is a second, independent leak** (e.g. the listener gap) that this doesn't cover. Mitigation: the instrumentation ships regardless and will surface any residual growth; Fix 3 covers the known listener gap defensively.
- **Alternative — only add instrumentation and bisect v3.1.5..v3.1.7 first.** Rejected as primary: the disk-log evidence already pins the mechanism without a 12h+ soak, and bisect would land no fix. Bisect remains a fallback if post-fix soak still shows CPU growth.
- **Alternative — segment the over-cap partial as ring lines instead of front-trimming.** Rejected (default) because rejoining ring lines with `\n` injects spurious line feeds into a TUI replay; front-trim avoids that. Revisit if a continuation-aware ring model is wanted later.

## Test Plan

Run from the worktree (`pnpm --filter @cluesmith/codev …`), not the main checkout.

- **Unit — CPU bound (the core fix):** feed a synthetic no-newline stream of M bytes across K frames into `RingBuffer.pushData`; assert per-frame work does not scale with accumulated size (e.g. assert `partial.length` stays ≤ cap, and a frame-cost proxy stays flat as the stream grows). Today this test would show partial growing to M and unbounded re-scan; after the fix it stays bounded.
- **Unit — replay correctness (no regression):** a normal newline-delimited stream produces byte-identical `getAll()` / `getSince()` output before and after the change.
- **Unit — shellper buffer:** feed a zero-newline stream exceeding `maxBytes`; assert `ShellperReplayBuffer.size` stays ≤ `maxBytes` and `getReplayData()` returns the bounded tail.
- **Build + full suite:** `pnpm --filter @cluesmith/codev build` and `… test` green from the worktree.
- **Manual / live (at `dev-approval`):** start Tower on this branch, open an architect terminal running Claude's full-screen UI, let it redraw for a while, and watch `afx tower log -f`: the new instrumentation should show the partial size **plateau at the cap** rather than climb, and Tower CPU should stay low. Reconnect the terminal (close/reopen the VSCode tab) and confirm the screen repaints correctly (replay still works). Optionally stop/start Tower against a still-busy session and confirm CPU does **not** immediately re-saturate (Fix 2 working).
- **Soak (post-merge / verify, non-gating):** leave Tower running several hours on a real workload; confirm CPU stays flat. This is the true end-to-end confirmation but cannot fit a gate session.

## Open Questions for the Reviewer

1. **Cap sizes:** proposed `MAX_PARTIAL_BYTES` ~256 KB–1 MB and `ShellperReplayBuffer maxBytes` ~ a few MB. Comfortable with these, or want them configurable via env?
2. **Fix 3 (listener hygiene):** include in this PR as a small defensive guard, or split to a follow-up issue to keep this change tightly scoped to the buffer fix?
