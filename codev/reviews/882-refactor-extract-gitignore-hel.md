# PIR Review: Extract gitignore helpers out of `scaffold.ts`

Fixes #882

## Summary

Moved the three gitignore management helpers (`createGitignore`, `updateGitignore`, `backfillGitignore`), their constants (`CODEV_GITIGNORE_ENTRIES`, `FULL_GITIGNORE_CONTENT`), the private `parseEntryLines` helper, and the three gitignore-shaped types out of `packages/codev/src/lib/scaffold.ts` into a new dedicated `packages/codev/src/lib/gitignore.ts`. `scaffold.ts` now holds only genuine scaffolding helpers (directory creation, skeleton copying, root-file templating). Pure file move + import rewire — zero behavior change, no renames, no function-shape changes.

## Files Changed

- `packages/codev/src/lib/gitignore.ts` (+151 / -0, new)
- `packages/codev/src/lib/scaffold.ts` (+8 / -116 net)
- `packages/codev/src/commands/init.ts` (+1 / -1)
- `packages/codev/src/commands/adopt.ts` (+1 / -1)
- `packages/codev/src/commands/update.ts` (+3 / -1)
- `packages/codev/src/__tests__/gitignore.test.ts` (+233 / -0, new)
- `packages/codev/src/__tests__/scaffold.test.ts` (+0 / -209)
- `codev/plans/882-refactor-extract-gitignore-hel.md` (+82 / -0, plan artifact)
- `codev/state/pir-882_thread.md` (+24 / -0, thread artifact)

## Commits

- `27f055d8` [PIR #882] Plan draft
- `63689fac` [PIR #882] Extract gitignore helpers out of scaffold.ts
- `15418d71` [PIR #882] Thread: implementation complete

(Plus six `chore(porch)` commits porch wrote at phase / gate transitions — these document the protocol's state-machine moves but contain no code changes.)

## Test Results

- `pnpm build` (root, builds `@cluesmith/codev-core` then `@cluesmith/codev`): ✓ pass
- `pnpm test -- run` (full vitest suite): ✓ pass — **151 files, 3187 tests, 0 failed, 13 pre-existing skips**
- Porch's `dev-approval` `checks` block re-ran `build` (5.5s) and `tests` (20.2s) at `porch done`: both green
- Grep audit (`createGitignore | updateGitignore | backfillGitignore | CODEV_GITIGNORE_ENTRIES | FULL_GITIGNORE_CONTENT | parseEntryLines | BackfillGitignoreResult | BackfillGitignoreOptions | UpdateGitignoreResult`): zero hits in `scaffold.ts` / `scaffold.test.ts`; all consumers reach the new module via `../lib/gitignore.js`
- Manual verification: the human approved the running worktree at the `dev-approval` gate

## Architecture Updates

No arch.md changes needed — this PR reorganizes file boundaries within `packages/codev/src/lib/` without changing module responsibilities, public CLI surface, or any cross-package contract. The new `gitignore.ts` is a peer of `scaffold.ts` in the same `lib/` folder, consumed by the same three commands. No new layer, no new dependency direction, no new pattern. The arch doc's existing description of init / adopt / update remains accurate.

## Lessons Learned Updates

No lessons-learned.md changes needed — this was a mechanical extraction predicated on a clear smell (filename no longer matches contents) that the issue itself articulated. The decision to split was already made and validated by the post-merge discussion on PR #881; the execution carried no surprises worth capturing as durable wisdom. The general pattern ("watch for header drift; rename or split when a file's name stops matching its contents") is well-known and not specific to this codebase.

## Things to Look At During PR Review

- **Test split fidelity** (`gitignore.test.ts` vs the deleted blocks from `scaffold.test.ts`): the four `describe` blocks (`createGitignore`, `updateGitignore`, `CODEV_GITIGNORE_ENTRIES`, `backfillGitignore (issue #880)`) moved verbatim — same `it()` bodies, same assertions. The new file ships its own minimal `beforeEach` (just `tempDir` — the scaffold-only skeleton fixtures aren't needed here) instead of inheriting `scaffold.test.ts`'s heavier setup. Worth diffing the moved blocks line-by-line if you want to confirm zero behavioral drift in the tests themselves.
- **Spec 0126 regression block stayed in `scaffold.test.ts`** (lines 274–) — it reads `scaffold.ts` source directly, so it correctly belongs with the scaffold tests. I considered adding a parallel regression that asserts `scaffold.ts` source no longer contains `gitignore` / `CODEV_GITIGNORE_ENTRIES`-style strings (mirroring the projectlist pattern), and flagged the option in the plan, but deferred the inclusion decision to dev-approval review and ultimately did not add it. Cheap to drop in if you want it.
- **Import shape in the three command files**: each command was changed from a single `from '../lib/scaffold.js'` block to two blocks — scaffold helpers from `scaffold.js`, gitignore helpers from `gitignore.js`. Symmetric with the existing pattern elsewhere in the codebase.
- **`parseEntryLines` stayed module-private**, same as before. No tests reach it directly — only via `backfillGitignore`.

## How to Test Locally

For reviewers pulling the branch:

- **View diff**: VSCode sidebar → right-click builder `pir-882` → **View Diff** (auto-detects the repo's default branch)
- **Run dev server**: this PR has no UI surface, so the dev server doesn't add information — but `afx dev pir-882` works if you want to smoke-test the CLI from inside the worktree
- **What to verify**:
  - `pnpm build` clean (catches any missed import)
  - `pnpm test -- run gitignore scaffold init adopt update` green — the rewired commands exercise the moved imports end-to-end (init writes a fresh `.gitignore`, adopt merges into existing, update backfills missing entries)
  - From the built CLI: `node packages/codev/dist/cli.js init /tmp/codev-smoke --yes && cat /tmp/codev-smoke/.gitignore` — expect the Codev block including `.architect-role.md` and the standard `node_modules/` / `dist/` / OS-file entries
