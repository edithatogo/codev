# Review: Foundational reusable package `@cluesmith/codev-artifact-canvas`

> **Status: in progress.** This review is completed during the SPIR Review phase. Sections are
> seeded during implementation where the protocol requires (e.g. Flaky Tests, below).

- **Spec**: [codev/specs/945-build-foundational-reusable-pa.md](../specs/945-build-foundational-reusable-pa.md)
- **Plan**: [codev/plans/945-build-foundational-reusable-pa.md](../plans/945-build-foundational-reusable-pa.md)
- **GitHub Issue**: [#945](https://github.com/cluesmith/codev/issues/945)

## Flaky Tests

During Phase 2 (renderer), porch's `tests` check (which runs the **entire `@cluesmith/codev`
suite**, exit-code-based) failed on **pre-existing flaky tests in the codev package** — **not** in
the new `artifact-canvas` package, which made zero codev changes this spec.

**Evidence the failures are flaky and unrelated to spir-945:**
- The same suite passed with **0 failures** in Phase 1 (3258 passed).
- The full-suite run failed **7** tests across 4 files; re-running just those 4 files gave only
  **1** failure (7→1) — non-deterministic, i.e. flaky, not a regression.
- Phase 2 touched only `packages/artifact-canvas/`; no codev source/test was modified.
- No worktree git pollution (the temp `ci`/`develop`/`feature` branches in the output are
  test-fixture repos, not the real worktree).

**Quarantined (skipped) per the builder protocol's "Handling Flaky Tests" rule, architect-authorized
(2026-06-10), on the `builder/spir-945` branch.** Each skip carries a `// FLAKY: skipped pending
investigation` annotation naming the flake pattern:

| File | Skipped | Flake pattern |
|---|---|---|
| `packages/codev/src/agent-farm/__tests__/tunnel-integration.test.ts` | `describe.skip('tunnel integration (Phase 4)')` | File-watcher timing — config file watcher races on detect change/deletion |
| `packages/codev/src/__tests__/default-branch.test.ts` | `describe.skip('resolveDefaultBranch')` | Git-fixture isolation — temp-repo default-branch resolution |
| `packages/codev/src/__tests__/non-main-default-branch.test.ts` | all 3 describes (`#784`, `#777 Defect A`, `#777 architect impl`) | Git-fixture isolation — temp-repo three-dot diff / GitRefResolver ref reads |
| `packages/codev/src/__tests__/team-cli.test.ts` | `describe.skip('afx team deprecation')` (only — other describes left active) | Deprecation-warning spy ordering (runAgentFarm spy state) |

These predate spir-945 and are unrelated to artifact-canvas. The architect is filing a tracker
issue for the underlying flake fix so the skips are not permanent; that issue references this
branch's skip commit. **Action for the Review phase / un-skip:** remove these `.skip`s once the
tracker fix lands.
