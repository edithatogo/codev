# PIR #982 — Builder thread

Issue: vscode + tower "No active terminal for X" toast is unactionable. Label: `area/cross-cutting`.

## Plan phase (iteration 1)

**Root cause confirmed by reading code:** the sidebar tree and the terminal-opener read two different Tower sources.
- Sidebar renders from `OverviewBuilder` (overview cache, `/api/overview`) — disk-sourced, **no `terminalId`** (`packages/types/src/api.ts:141-225`). Row shows while worktree exists.
- Opener `openBuilderByRoleOrId` (`packages/vscode/src/terminal-manager.ts:186-215`) reads `getWorkspaceState` → `DashboardState.builders.terminalId` (in-memory PTY session id). Tower restart drops the in-memory registry → `terminalId` null → bare warning at `terminal-manager.ts:206-209`.

**Decision:** ship Option 1 (better message) + Option 2 (in-extension recovery), defer 3/4/5.
- New toast (replacing the bare warning): names the builder, explains likely cause (Tower restart), buttons **Recover Builders** + **Retry**.
- **Recover Builders** → `createTerminal({ cwd: workspacePath })` + `sendText('afx workspace recover')` (dry-run), mirroring `commands/run-worktree-setup.ts:51-56`. Deliberately stops at dry-run (recover is workspace-wide, can't target one builder).
- **Retry** → re-attempt open (handles the transient spawn/recover race, cause 3).
- Pure-vscode, confined to the `!terminalId` branch → happy path untouched.
- Deferred: Option 3 (sidebar icon) needs a `terminalId`/liveness field threaded through overview server + types — cross-package, no extra acceptance coverage → follow-up issue. Options 4/5 explicitly deferred by the issue.

Toast button pattern reference: `notifications/gate-toast.ts:109-139`. Tests extend `packages/vscode/src/__tests__/terminal-manager.test.ts` (vitest, `pnpm --filter codev-vscode test:unit`).

Plan written to `codev/plans/982-vscode-tower-no-active-termina.md`. Committed, pushed. Sitting at `plan-approval` gate.
