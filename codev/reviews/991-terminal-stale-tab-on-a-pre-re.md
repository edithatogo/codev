# PIR Review: Terminals survive a Tower restart — core Tower fix

Fixes #991.

## Summary

Issue #991 asked for terminals to reconnect after a Tower restart without a manual refresh, framed as a client-side "re-mount onto the successor session id" problem on the dashboard and the VSCode terminal. Live debugging at the `dev-approval` gate found that the real causes were **two Tower-level bugs**, and that the client-side framing could never work. The shipped fix is at the source:

1. **`afx tower stop` no longer kills clients of the Tower port.** `getProcessesOnPort` used `lsof -ti :PORT`, which returns the listener *and every client*. The VSCode extension host holds client sockets to the port (SSE + terminal WebSockets), so `afx tower stop` SIGTERM'd it — destroying and re-activating the whole extension host on every restart, which is why no recovery code ever ran. Adding `-sTCP:LISTEN` restricts the match to the listening server.

2. **The terminal id is preserved across a Tower restart.** Reconcile previously minted a new `randomUUID()` for each reconnected session and deleted the old row, so the client's `/ws/terminal/<id>` url went dead. `createSessionRaw` now accepts an optional id, and both reconcile paths pass the persisted `dbSession.id`. The session keeps its identity, so the client's existing backoff-reconnect re-attaches to the same valid url — on both surfaces, with no special recovery code.

The client-side workarounds built earlier in the cycle were removed; the dashboard self-heal was kept as a harmless (now dormant) safety net.

## Architecture Updates

No `arch.md` change required. The fix reinforces an existing invariant rather than adding structure: **a Tower restart is meant to be transparent to clients** — persistent shellper sessions survive (already true), and now their terminal **ids** survive too, so the existing transport-reconnect layer (`@cluesmith/codev-core/reconnect-policy`, the terminal adapters) handles a restart as an ordinary transient drop. One operational rule worth carrying forward (captured in Lessons): **port lifecycle commands must target the listener (`-sTCP:LISTEN`), never all sockets on the port**, or they take clients down with the server.

## Lessons Learned Updates

- **Confirm the runtime survives the event before building recovery on top of it.** Many iterations of client-side terminal recovery were spent before checking the single most important precondition — *does the extension host even survive a Tower restart?* It did not (`afx tower stop` was killing it). The one-line check (`lsof -ti :PORT` returns the editor host) would have redirected the whole effort on day one. When a recovery mechanism "does nothing," verify the process that runs it is still alive.
- **`lsof -ti :PORT` selects clients too.** Any "what's on this port" / "kill what's on this port" logic must use `-sTCP:LISTEN` to mean *the server*. Without it, every connected client (editors, browsers, other tools) is collateral.
- **Fix the source, not the symptom.** #936/#971/#991/#997 are all consequences of the terminal id changing on restart. Preserving the id removes the dead-id condition those work around. The cheapest fix is often upstream of where the symptom shows.

## Files Changed

**Core fix (Tower):**
- `packages/codev/src/agent-farm/commands/tower.ts` — `getProcessesOnPort` → `lsof -ti :PORT -sTCP:LISTEN` (+ doc comment on why it's load-bearing).
- `packages/codev/src/terminal/pty-manager.ts` — `createSessionRaw` accepts optional `id` (`opts.id ?? randomUUID()`).
- `packages/codev/src/agent-farm/servers/tower-terminals.ts` — both reconcile paths (startup + on-the-fly) pass `dbSession.id`; comments/log updated for id preservation.
- `packages/codev/src/terminal/__tests__/tower-shellper-integration.test.ts` — unit test: `createSessionRaw` reuses a provided id, mints a fresh one without.

**Removed (superseded client workarounds, reverted to `#921` base):**
- `packages/vscode/src/terminal-manager.ts`, `packages/vscode/src/extension.ts`, `packages/vscode/src/__tests__/terminal-manager.test.ts`.

**Kept (dashboard self-heal, harmless/dormant after the core fix):**
- `packages/dashboard/src/components/Terminal.tsx`, `App.tsx`, `__tests__/Terminal.reconnect.test.tsx`.

## Test Results

- **codev** typecheck: 0 errors. Targeted suite (shellper-integration + tower-terminals + pty-manager): **82 passed** (incl. the new id-reuse test and the reconcile tests — id preservation does not break reconcile).
- **vscode** check-types clean; **318 tests passed** (post-revert).
- **dashboard** **322 passed** / 1 pre-existing skip.
- The empirical proof for fix #1 (`lsof -ti :4100` returning the VSCode `Code Helper (Plugin)` host vs. `-sTCP:LISTEN` returning only the node server) is documented in the builder thread.

## Things to Look At

- **The reconcile-gap edge:** a client reconnect that lands after Tower accepts connections but before startup reconcile re-registers the session could 404 once and recover on the next retry/click. Rare in practice; **#997 (reconcile-before-serving)** is the deterministic follow-up.
- **Scope/area:** this PR is primarily an `area/tower` server fix, a pivot from the issue's cross-cutting client framing. The kept dashboard self-heal is the only remaining client-side piece.
- **Deploy ordering:** the host-kill fix lives in `afx tower stop`; the id-preservation lives in the Tower server. Both ship via `local-install`, which restarts Tower using the freshly-installed `afx`.

## How to Test Locally

A real Tower restart can't be exercised from a builder session (it would kill it), so this is reviewer-run:

```bash
pnpm build && pnpm -w run local-install   # new afx (host-kill fix) + new Tower (id preservation)
# with a builder/architect terminal open:
afx tower stop && afx tower start
```

**Expect:** the VSCode extension host does **not** restart, and open terminals reconnect to the same session within the normal backoff (buffer replayed) — no dead pane, no manual reopen, no new window. Negative check: a >~60s downtime shows the existing `Click here to reconnect` give-up, which now reconnects (the id is preserved) instead of retrying a dead id.
