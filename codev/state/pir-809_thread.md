# PIR #809 Thread — vscode backlog mine/all toggle

## Plan phase
- Issue: add a Mine/All toggle to the Backlog view title bar with `codev.backlogShowAll` config flag (default false = mine-only).
- Pattern: two-commands + one config flag + paired `when` clauses, mirroring `codev.buildersAutoCollapse` / `codev.buildersFileViewAsTree`.
- Plan committed to `codev/plans/809-vscode-backlog-view-toggle-bet.md`.
- Filter lives in `BacklogProvider.orderedSpawnable` (the single chokepoint feeding both root and per-group rendering).
- Empty-state placeholder renders only when `currentUser` is known AND filter yields zero — avoids confusing the not-yet-loaded path.
- Awaiting `plan-approval`.

## Plan-approval gate
- Approved by architect on 2026-05-28.
- Rebased branch onto fresh `origin/main` (68 commits of main landed under our 4 commits, clean).
- Plan refinement commit landed before phase-transition: corrected test file path from `tests/unit/views/backlog.test.ts` (doesn't exist) to `src/__tests__/backlog-filter.test.ts` after discovering the `src/test/` (vscode-test/Mocha) vs `src/__tests__/` (vitest) separation enforced by `vitest.config.ts`.

## Implement phase
- Extracted `filterMine` into its own file `packages/vscode/src/views/backlog-filter.ts` — vitest tests in `__tests__/` can't import from `backlog.ts` because it pulls in `vscode`. Standard codebase pattern (mirrors what other pure helpers do).
- `BacklogProvider` reads `codev.backlogShowAll` via a `readBacklogShowAll()` helper at the bottom of `backlog.ts`. Applied in `orderedSpawnable`; placeholder branch added at the top of `rootChildren`.
- Two commands `codev.showBacklogAll` / `codev.showBacklogMineOnly` registered in `extension.ts`; paired `view/title` menu entries in `package.json` use `$(eye)` / `$(eye-closed)` icons.
- `onDidChangeConfiguration` listener mirrors the setting into the `codev.backlogShowAll` context key and refreshes the provider — matches the file-view-as-tree block structure verbatim.
- Checks: `pnpm check-types` ✓, `pnpm lint` ✓, `pnpm test:unit` 100/100 ✓ (5 new), root `pnpm build` ✓, root `pnpm test` 3188/3201 (13 pre-existing skips) ✓.
- Awaiting `dev-approval`.
