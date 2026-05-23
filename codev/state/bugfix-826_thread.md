# bugfix-826 thread

## 2026-05-23 — Bugfix start

**Issue**: #826 — Sibling architects leak across workspaces. v3.1.1 hotfix.

**Approach (per architect instruction)**: Option B — modify `launchInstance` reconcile loop to only re-spawn architects whose `terminal_sessions.workspace_path` matches the current workspace. No schema migration.

**Phase**: investigate

Plan:
1. Find `launchInstance` reconcile loop (introduced in #786)
2. Identify the architect iteration that re-spawns siblings
3. Find the right join with `terminal_sessions` to gate by `workspace_path`
4. Implement minimal fix
5. Add regression test
6. PR + CMAP review

## Fix shape

- New helper `getArchitectsForWorkspace(workspacePath)` in `state.ts`. Two-query approach (no SQLite cross-DB attach): first reads `role_id` values from `terminal_sessions` in `global.db` filtered by `type='architect' AND workspace_path=?`, then intersects with `state.db.architect` rows by name.
- `launchInstance` reconcile loop in `tower-instances.ts` now calls `getArchitectsForWorkspace(resolvedPath)` instead of unscoped `getArchitects()`.
- Tests: 5 new tests in `state.test.ts` for the helper, 1 source-level sentinel in `tower-instances.test.ts`.

## Known trade-off (called out in PR for architect awareness)

Because `deleteWorkspaceTerminalSessions` wipes all terminal_sessions rows for a workspace on `afx workspace stop`, the matching workspace_path signal is also wiped. That means after a `stop + start` cycle, persisted sibling architects in `state.db.architect` will *not* be re-spawned — a partial regression of Spec 786's stop+start sibling persistence story. This is the trade-off the issue's "Option B" explicitly accepts vs. Option A (proper schema migration). v3.1.2 prioritizes stopping the cross-workspace leak; Option A is the proper long-term fix.

## Architect call: Option B+ (iter-2)

Architect's independent CMAP had Codex flag the regression. Architect chose Option B+: preserve architect rows on stop so Spec 786's stop+start story still works.

Additional changes (iter-2):
- `deleteWorkspaceTerminalSessions(path, { includeArchitects? = false })` — default preserves architect rows on stop. Full-wipe callers (`handleWorkspaceStopAll`) opt in.
- All four architect exit handlers in `tower-instances.ts` now skip `deleteTerminalSession(session.id)` (in addition to the existing skip of `setArchitectByName(name, null)`) when intentionally stopping. Architect rows survive in BOTH `state.db.architect` and `global.db.terminal_sessions` across an `afx workspace stop`.
- `saveTerminalSession` enforces a `(workspace_path, role_id)` uniqueness invariant for `type='architect'` rows: pre-deletes any existing architect row before inserting. Prevents stale-row accumulation across multiple stop+start cycles (since the new PTY gets a fresh terminal id each time).
- 3 new behavioral integration-contract tests in `state.test.ts` exercise the full lifecycle: stop preserves architect rows in both tables, cross-workspace isolation holds, and repeated stop+start cycles don't accumulate stale rows.

## Test run notes

- `state.test.ts` — 27/27 pass (including 5 new tests for `getArchitectsForWorkspace`).
- `tower-instances.test.ts` — 52/52 pass (including new source-level sentinel test).
- Pre-existing flaky test files in this worktree (unrelated to fix): `session-manager.test.ts` (shellper binary not built in worktree) and `update.test.ts` (skeleton dir not copied). Neither file is in my diff vs main.
