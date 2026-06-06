# PIR Plan: Actionable recovery for the "No active terminal" toast

## Understanding

Clicking a builder row in the Codev sidebar can produce a dead-end warning toast:

```
Codev: No active terminal for <builder-id>
```

…and nothing else happens. The row keeps looking healthy, but the click can't open a terminal.

**Root cause (confirmed by reading the code):** the sidebar tree and the terminal-opener read from two *different* Tower sources that can disagree:

- The **sidebar** renders from `OverviewBuilder` (the overview cache / `/api/overview`). `OverviewBuilder` is filesystem-sourced and **has no `terminalId` field** (`packages/types/src/api.ts:141-225`). A builder shows up as long as its worktree exists on disk.
- The **terminal opener** (`openBuilderByRoleOrId`, `packages/vscode/src/terminal-manager.ts:186-215`) fetches `getWorkspaceState` → `DashboardState.builders` (`/api/state`), whose `Builder.terminalId` (`api.ts:36`, optional) binds a builder to a *live* in-memory PTY session.

When Tower restarts (its PTY session registry is in-memory and not persisted), the worktree records survive but the session ids don't. The sidebar still lists the builder (disk-sourced); the click fails because `terminalId` is null/empty. The same divergence happens when a PTY session dies without the builder being cleaned up (cause 2), or transiently during the spawn/recover race window (cause 3, self-heals next overview tick).

The warning fires here, with no action and no recovery path:

```ts
// packages/vscode/src/terminal-manager.ts:206-209
if (!builder?.terminalId) {
  vscode.window.showWarningMessage(`Codev: No active terminal for ${roleOrId}`);
  return;
}
```

The message is *correct* (something is wrong) but unactionable: the user must already know that `afx workspace recover` exists, that it must run from the workspace root (not a worktree), and that it only helps if the builder process is recoverable.

## Proposed Change

The issue lists five candidate layers and defers the choice to this gate. I recommend shipping **Option 1 (better message) + Option 2 (in-extension recovery affordance)** composed together — exactly the "v1" the issue suggests — and **deferring Options 3, 4, 5** (rationale below). This composition satisfies all four acceptance criteria with a pure-vscode change confined to the single `!terminalId` branch, so the happy path is untouched.

Replace the bare `showWarningMessage(...)` at `terminal-manager.ts:206-209` with an actionable toast carrying two buttons:

1. **Message** — explain the likely cause and the path forward, e.g.:
   > `Codev: #<id>'s terminal session is gone (most likely Tower restarted). Run recovery to revive it, or Retry if this just happened.`

   (Use the friendly `#<issueId> <title>` identity already available via the resolved `builder`, not the raw `roleOrId`, so the toast matches the row the user clicked.)

2. **"Recover Builders" button** — opens a fresh VSCode terminal at the workspace root and runs `afx workspace recover` (the default **dry-run** preview), mirroring the established pattern in `commands/run-worktree-setup.ts:51-56` (`createTerminal({ name, cwd: workspacePath })` + `terminal.sendText('afx …')`). This is "one-click, in-extension, no doc-lookup" *and* it deliberately stops at the dry-run so the user reviews exactly which builders will be revived before re-running with `--apply`. We do **not** auto-run `--apply`: `recover` is workspace-wide (it cannot target a single builder — confirmed in `agent-farm/commands/workspace-recover.ts`), so silently respawning the whole workspace from a single row-click would be too blunt. `workspacePath` is already in scope at `terminal-manager.ts:188`.

3. **"Retry" button** — re-invokes the open once. This handles the transient race (cause 3): if the `terminalId` populated on the next overview tick, the retry just succeeds; if it's still missing, the user gets the same actionable toast back rather than a silent dead-end.

The handler uses the existing button-return pattern (`notifications/gate-toast.ts:109-139`): pass labels as positional args to `showWarningMessage`, branch on the returned string.

### Deferred options (with reasons)

- **Option 3 (sidebar icon for dropped sessions)** — independent and layerable, but **not free**: `OverviewBuilder` carries no liveness/`terminalId` signal, so flagging the row *before* a click would require threading a `hasLiveSession` field from Tower's in-memory registry through the overview server (`agent-farm/servers/overview.ts`) and `@cluesmith/codev-types` into `builders.ts`. That's a cross-package change with real blast radius, and the toast fix already meets every acceptance criterion. Recommend a separate follow-up issue.
- **Option 4 (auto-recover on activation)** — a behavior decision (auto-run vs prompt) the issue itself flags for deferral; out of scope.
- **Option 5 (persist Tower's session registry)** — the root-cause fix, explicitly called out as a separate, larger discussion; out of scope.

## Files to Change

- `packages/vscode/src/terminal-manager.ts:206-209` — replace the bare warning in `openBuilderByRoleOrId` with the actionable, buttoned toast (message + **Recover Builders** + **Retry**). Factor the toast into a small private helper (e.g. `showNoTerminalRecovery(builder, roleOrId, focus)`) so the `openBuilderByRoleOrId` body stays readable and the helper is unit-testable. The helper reuses the already-fetched `workspacePath`.
- `packages/vscode/src/__tests__/terminal-manager.test.ts` — extend the existing suite: assert (a) the toast text names the builder and mentions recovery, (b) choosing **Recover Builders** creates a terminal with `cwd = workspacePath` and sends `afx workspace recover`, (c) choosing **Retry** re-attempts the open, (d) the happy path (`terminalId` present) still opens the builder terminal and shows no warning. Mock `vscode.window.showWarningMessage` / `createTerminal` as the existing tests do.

No `package.json` command contribution is needed — the buttons are handled inline in the toast callback (they don't need to be palette-invocable commands). No types or server changes.

## Risks & Alternatives Considered

- **Risk: `afx workspace recover` doesn't revive cause-2 (process still alive, session dropped).** `recover` revives builders whose shellper process *died*; a live-process/dead-session case may be skipped. Mitigation: the toast says "most likely Tower restarted" (the dominant, cause-1 case where the process is gone and recover works) and offers **Retry** for the transient case. We don't over-promise a guaranteed fix; we give the correct first action. Deeper cause-2 handling is `afx workspace recover`'s own concern (tracked at #915).
- **Risk: Recover is workspace-wide, not row-scoped.** Mitigated by stopping at the dry-run preview (no `--apply`) so the user sees and confirms scope. An alternative — shelling `afx workspace recover --apply -y` directly via `child_process` for one click — was **rejected**: it hides which builders get respawned and respawns the whole workspace from a single row click.
- **Alternative: add `terminalId`/liveness to `OverviewBuilder` and gate the row visually (Option 3).** Rejected for v1 — larger cross-package surface for no additional acceptance coverage. Recommended as a follow-up.
- **Risk: regression to the happy path.** Mitigated by confining the change to the `!terminalId` branch and adding an explicit happy-path test.

## Test Plan

**Unit (`packages/vscode/src/__tests__/terminal-manager.test.ts`, run via vitest — `pnpm --filter codev-vscode test:unit`):**
- `!terminalId` → `showWarningMessage` called with a message naming the builder + the two button labels.
- Selecting **Recover Builders** → `createTerminal` called with `cwd === workspacePath`; `sendText('afx workspace recover')`.
- Selecting **Retry** → `openBuilderByRoleOrId` re-invoked (or the open re-attempted).
- Happy path: `terminalId` present → builder terminal opens, `showWarningMessage` NOT called.

**Manual (reviewer at the `dev-approval` gate — run the worktree):**
1. Spawn or have a builder present, then restart Tower (`pnpm -w run local-install`) so its in-memory session registry clears while the worktree/row persists.
2. Click the builder row in the Codev sidebar → confirm the new actionable toast (names the builder, mentions recovery) instead of the bare warning.
3. Click **Recover Builders** → a terminal opens at the workspace root running `afx workspace recover` (dry-run preview); confirm the cwd is the main checkout, not a worktree.
4. Click a healthy builder row → terminal opens normally, no toast (happy-path regression check).
5. (Race/transient) While a builder is mid-spawn, click it; if the toast appears, click **Retry** after a tick → it opens.

**Cross-platform:** n/a (desktop VSCode extension only; no mobile/web surface).

## Build / Verify Commands

- `pnpm --filter codev-vscode test:unit` — the vitest unit suite (where the new tests live).
- `pnpm --filter codev-vscode compile` — typecheck + lint + esbuild bundle of the extension.
