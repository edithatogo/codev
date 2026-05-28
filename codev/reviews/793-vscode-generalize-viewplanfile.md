---
issue: 793
protocol: pir
---

# Review: vscode generalize viewPlanFile to viewSpecFile + viewReviewFile

## Summary

Generalised the existing `codev.viewPlanFile` command (previously PIR-only) into a sibling trio (`viewSpecFile` / `viewPlanFile` / `viewReviewFile`) with protocol-aware right-click menu visibility on the Builders tree. The dispatcher in `view-artifact.ts` was already kind-generic — most of the change is declarative (`ArtifactKind` widened, two thin wrappers, two new command registrations, three `view/item/context` `when` clauses). The one piece of real new logic is a `-review` suffix on the row's `contextValue` driven by a `readdirSync` against `<worktree>/codev/reviews/`, which the `viewReviewFile` `when` clause keys off to hide the entry on PIR rows until the review phase produces the file. Unblocks downstream issue #792.

## Spec Compliance (against issue #793)

- [x] `ArtifactKind` widened to `'plan' | 'spec' | 'review'`
- [x] `codev.viewSpecFile` and `codev.viewReviewFile` registered alongside the existing `viewPlanFile`
- [x] `view/item/context` `when` clauses encode the visibility table from the issue (SPIR/ASPIR: all three; AIR: review only; PIR: plan always, review only when on-disk file exists; BUGFIX/TICK: none)
- [x] `contextValue` extended with a `-review` suffix when the builder has a committed review file
- [x] Stale "View Review File was intentionally not added" comment at the top of `view-artifact.ts` removed
- [x] No PR-URL fallback for PIR — the issue explicitly rejected that approach

## Key Metrics

- **Commits**: 3 implementation commits on `builder/pir-793` (plan draft, generalise dispatcher, encode `contextValue` + tests, plus a follow-up ternary refactor)
- **Tests**: 75/75 vitest in `packages/vscode/` passing, including **38 new** menu-when-clauses matrix cases (protocol × family × has-review-file)
- **Files changed**: 5 in `packages/vscode/`
  - `package.json` (+22 / -3) — two new command declarations, three new menu entries replacing one
  - `src/__tests__/menu-when-clauses.test.ts` (+97 new) — visibility-matrix unit test
  - `src/commands/view-artifact.ts` (+18 / -14) — widened `ArtifactKind`, added two wrappers, rewrote docblock
  - `src/extension.ts` (+5 / -1) — registered two new commands
  - `src/views/builders.ts` (+50 / -7) — `-review` suffix wiring, `builderHasReviewFile` helper
- **Net LOC impact**: +190 (most of which is the new test file)

## Deviations from Plan

- **Refactor in dev-approval**: nested ternary `isBlocked ? 'blocked-builder' : isIdle ? 'awaiting-builder' : 'builder'` flagged by reviewer, replaced with an `if`/`else if`/`else` chain plus an explicit 3-value union type annotation on `family`. Scope kept surgical — the two other nested ternaries in the same file (`phaseLabel`, `iconPath`) were left alone since they were pre-existing.

## Consultation Iteration Summary

CMAP-2 at the PR is the only consultation round in PIR (a single advisory pass, `max_iterations: 1`). Filled in once `porch verify` returns.

| Phase | Iters | Who Blocked | What They Caught |
|-------|-------|-------------|------------------|
| Review | 1 | — | TBD (filled in post-CMAP) |

## Lessons Learned

### What Went Well

- **`view-artifact.ts` was already kind-generic.** The original Spec 786 / 791 implementation parameterised on `ArtifactKind` even though only `'plan'` was needed at the time. Widening it cost almost no code — most of the diff is declarative (`package.json` menu entries, command registrations, test matrix). The pattern of "build the generic shape even when only one variant is shipped" paid off cleanly here.
- **Vitest matrix on `when` clauses** is high-leverage for VSCode contributes-based menus. The regex is the *only* gate on whether a row's right-click menu shows an entry; no compile-time or runtime error catches a drift between the three regexes. The 38-case matrix (protocol × family × has-review-file) pins all three regexes in sync as the source of truth for future protocol additions.

### Challenges Encountered

- **Per-row VSCode menu gating has only one signal**: `viewItem` (the row's `contextValue` string). VSCode's `when`-clause language has no access to per-row data beyond that. Encoding "this PIR row has a review file on disk" required reading the disk during tree-row construction and baking the answer into `contextValue` as a `-review` suffix, then encoding the optional suffix in the regex. `setContext` is global and can't express per-row state. The plan's chosen design (sync `readdirSync` per builder per render) is cheap enough given the reviews dir is small and local, and the tree already does heavier work on row expansion.
- **23 pre-existing test failures in `packages/codev/`** (`adopt.test.ts`, `update.test.ts`, `consult.test.ts`, `session-manager.test.ts` real-shellper integration). None touch any file in this diff and none have failure traces through `packages/vscode/`. Surfaced once during local verification, confirmed out-of-scope, left alone per protocol guidance.

### What Would Be Done Differently

- Nothing material. The one minor friction — initial vitest run failed with `Cannot find module '@cluesmith/codev-core/...'` because deps weren't built — is a pre-existing local-setup gotcha (resolved by `pnpm --filter @cluesmith/codev-types --filter @cluesmith/codev-core build`), not something this PR introduces.

## Architecture Updates

No `codev/resources/arch.md` updates needed. This is an extension to the existing per-row context-value menu pattern (already documented in arch and exercised by `gate-toast.ts`, `approve.ts`, etc.) — no new architectural concept, no new module boundary, no change to how the Builders tree or `view-artifact.ts` dispatches.

## Lessons Learned Updates

No `codev/resources/lessons-learned.md` updates needed. The "vitest matrix as the source of truth for `when`-clause regexes" point is worth surfacing but is one example, not yet a recurring pattern across builders — premature to lift it into shared lessons. Re-evaluate once a second feature lands that uses the same pattern.

## Technical Debt

- **`builderHasReviewFile` does sync I/O on every tree render.** Mitigations in place: the reviews dir is local, small, and only inspected when overview data changes. The diff cache already does heavier work on row expansion. If profiling later shows this is a hot path (it isn't expected to be), the result could be cached on the overview-data refresh boundary.
- **The `viewReviewFile` `when` clause regex** uses an alternation (`(spir|aspir|air)(-review)?|pir-review`) that's slightly fiddly to read. The unit-test matrix is the readable source of truth; the regex is the machine encoding. Acceptable; not worth a refactor.

## Follow-up Items

- **Issue #792**: this PR was a prerequisite for it. With the three commands and protocol-aware visibility in place, #792 can now build on top.
- **Pre-existing codev-package test failures**: separate bugfix project. Out of scope here.
