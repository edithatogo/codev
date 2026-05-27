# PIR Review: Close builder terminal tabs on cleanup (read overview, not state)

Fixes #883

## Summary

The 3.0.6 fix for "builder terminal tabs close automatically on cleanup"
regressed because the present→absent diff was reading from the wrong
source. This PR points the diff at `overviewCache.getData().builders`
(disk scan via `discoverBuilders`) instead of
`client.getWorkspaceState().builders` (runtime registry rebuilt from
SQLite `terminal_sessions`), so the diff sees the absence the moment
`afx cleanup` removes the worktree directory — even while the
companion Tower-side bug (#783) leaves surviving shellper processes
pinning the SQLite-backed source open.

## Files Changed

- `codev/plans/883-vscode-builder-cleanup-no-long.md` (+216 / -0) — plan artifact
- `codev/state/pir-883_thread.md` (+79 / -0) — protocol thread log
- `packages/vscode/src/prune-builder-terminals.ts` (+62 / -0) — new pure helper module
- `packages/vscode/src/extension.ts` (+21 / -34) — diff wiring switched to overview cache
- `packages/vscode/src/__tests__/prune-builder-terminals.test.ts` (+116 / -0) — 11 vitest cases
- `codev/projects/883-vscode-builder-cleanup-no-long/status.yaml` (+22 / -0) — porch state

## Commits

- `e68197ac` [PIR #883] Plan draft
- `5c21360b` [PIR #883] Diff against overview.builders.roleId, not state.builders.id
- `724c4ea9` [PIR #883] Thread: implement phase complete

## Test Results

- `pnpm --filter codev-vscode check-types`: ✓ pass
- `pnpm --filter codev-vscode lint`: ✓ pass
- `pnpm --filter codev-vscode test:unit` (vitest): ✓ pass (49 tests, 11 new)
- `pnpm --filter codev-vscode test` (mocha integration): ✓ pass (83 tests)
- `porch done 883` checks: ✓ build (5.3 s), ✓ tests (20.5 s)
- Manual verification at the `dev-approval` gate: human approved

## Architecture Updates

No `arch.md` changes — the diff swaps one data source for another at the
same architectural boundary (VSCode extension reading from Tower).
There's no new module, pattern, or boundary to document. The new
`prune-builder-terminals.ts` helper is a vscode-free sidecar so a unit
test can import it without mocks; that's a testability detail, not an
architectural one.

## Lessons Learned Updates

Added one entry to `codev/resources/lessons-learned.md` under **Critical**:

> When a VSCode-side observer needs to react to a Tower-side cleanup,
> source the signal from the disk-truth endpoint (`/api/overview`,
> backed by `discoverBuilders`' `readdirSync(.builders/)` scan), not the
> runtime-registry endpoint (`/api/state`, backed by SQLite
> `terminal_sessions` reconciled against surviving shellpers). Detached
> shellper processes are *designed* to outlive Tower restarts and can
> therefore pin runtime-registry rows open through Tower's
> reconnect-on-the-fly path indefinitely. The filesystem state collapses
> to "did `afx cleanup` remove this worktree?" — which is the actual
> cleanup signal — so a disk-sourced diff is resilient to the orphan-
> shellper class of bugs (cf. #783) by construction.

This is a generalizable rule: any cleanup-detection diff in the
extension should default to the disk-scan source, and pick the
registry source only when worktree-existence isn't the right signal.

## Things to Look At During PR Review

- **The helper went into its own module** (`prune-builder-terminals.ts`)
  rather than living "adjacent to the wiring" in `extension.ts` as the
  plan wording suggested. Reason: vitest can't import a file that imports
  the real `vscode` API, so the test needs the helper to be in a module
  that's free of vscode imports. Functional shape is identical to the
  plan's intent.

- **Soft-mode limitation** (`roleId: null`). Soft-mode builders
  (`task-*`, `worktree-*` worktrees) won't auto-close their tabs via
  this path because the diff is keyed on `OverviewBuilder.roleId` which
  is `null` for them. The issue's repro path is bugfix-mode (strict),
  and the older state-based code wasn't reliably helping soft-mode
  either in the orphan-shellper scenario. Documented inline in the
  helper's doc comment.

- **The companion Tower bug (#783) is unfixed by design.** This PR
  explicitly does not touch the orphan-shellper / ghost
  `terminal_sessions` accumulation — that's #783's scope, and the issue
  marks it **Out of scope** for #883. After #783 lands, the VSCode
  resilience here keeps working (it's still reading the right source)
  but stops being load-bearing.

- **Sync vs the previous async function.** The old
  `pruneClosedBuilderTerminals` was `async` and guarded by `pruneInFlight`
  because it did an HTTP fetch on every tick; the new version is
  synchronous (`overviewCache.getData()` is an in-memory read) and the
  guard is gone. The call site in `overviewCache.onDidChange(...)`
  didn't `await` the old version either, so this is purely simplification.

## How to Test Locally

For reviewers pulling the branch:

- **View diff**: VSCode sidebar → right-click builder pir-883 → **View Diff**
- **Run dev server**: VSCode sidebar → **Run Dev Server**, or `afx dev pir-883`
- **Build + install**: `pnpm build && pnpm -w run local-install` (restarts Tower, picks up the patched extension)
- **What to verify**:
  - Spawn a fresh bugfix builder (`afx spawn <issue> --protocol bugfix`),
    open its terminal in VSCode, then `afx cleanup -p <id>` from a
    separate shell. Tab disappears within ~5 s of the cleanup printing
    `Builder ... cleaned up!`.
  - Repeat via VSCode's right-click → **Cleanup Builder** for the
    second variant.
  - Optionally start a dev terminal (right-click → **Run Dev Server**)
    before cleanup, then confirm its `(dev)` tab also disappears.
  - Spawn a fresh builder after cleanup; its terminal opens normally
    (no map-state pollution from the closure).
  - Sanity probe: `sqlite3 ~/.agent-farm/global.db "SELECT role_id FROM
    terminal_sessions WHERE type='builder'"` will likely still list
    cleaned-up builders (#783 left unfixed by design). The VSCode tab
    still closes — that's the point.

## Related

- **#783** (open, `area/tower`, `bug`) — Tower-side root cause: `afx
  cleanup` can't reach orphaned Tower terminals after `porch done`
  self-completion. The VSCode change here is resilient to that bug;
  fixing #783 makes `/api/state` clean again but doesn't invalidate
  this change.
