# PIR Review: Builders tree group-by-stage (action axis) with a stage/area toggle

Fixes #952

## Summary

The VSCode **Builders** tree now groups by the builder's lifecycle **stage** (the action axis — "where do I need to act?") instead of its `area/*` label, with the complementary axis shown as the row prefix. To serve reviewers who prefer the domain view, grouping is **switchable** via a title-bar toggle (`codev.buildersGroupBy`, default `stage`); area mode restores the original `area/*` grouping with a `[<phase>]` row prefix. Every protocol's phase ids fold into a **closed 6-stage canonical set** (`SPECIFY → PLAN → IMPLEMENT → REVIEW → PR → VERIFIED`, + `UNKNOWN`) so the tree is capped at a constant 7 groups regardless of how many protocols Codev adds. The two axes are expressed as a `BuilderGrouping` strategy pair so the provider never branches on the mode.

## Files Changed

- `packages/core/src/phase-grouping.ts` (+137 / -0) — new: `groupByStage`, `PHASE_TO_STAGE`, `STAGE_ORDER`, `BuilderStage`
- `packages/core/package.json` (+4 / -0) — export `./phase-grouping`
- `packages/vscode/src/views/builder-grouping.ts` (+83 / -0) — new: `BuilderGrouping` strategy interface + `stageGrouping`/`areaGrouping`
- `packages/vscode/src/views/builders.ts` (+~70 / -~38) — provider delegates to `active()` strategy; routing expansion wrapper
- `packages/vscode/src/views/builder-row.ts` (+~16 / -~19) — `builderRowLabel` is now a pure prefix formatter
- `packages/vscode/src/views/area-group-expansion.ts` (+~22 / -~10) — extract `GroupExpansionStore` interface
- `packages/vscode/src/views/area-group-tree-item.ts` (+~9 / -~9) — rename group-key field `areaName` → `groupName`
- `packages/vscode/src/views/builder-tree-item.ts` (+~14 / -~14) — axis-agnostic header; param `groupName`
- `packages/vscode/src/views/backlog.ts` (+1 / -1) — read `element.groupName` (field rename only)
- `packages/vscode/src/extension.ts` (+19 / -0) — `buildersGroupBy` context-key mirror + two toggle command handlers
- `packages/vscode/package.json` (+33 / -0) — `codev.buildersGroupBy` setting, two commands, two `view/title` menus
- `packages/vscode/src/__tests__/phase-grouping.test.ts` (+123 / -0) — new: `groupByStage` / mapping coverage
- `packages/vscode/src/__tests__/builder-grouping.test.ts` (+83 / -0) — new: strategy coverage
- `packages/vscode/src/__tests__/builder-row.test.ts` (~49 changed) — row label as pure formatter
- `codev/plans/952-*.md`, `codev/reviews/952-*.md`, `codev/state/pir-952_thread.md` — plan, this review, thread
- `codev/resources/lessons-learned.md` — three lessons (see below)

## Commits

`git log main..HEAD --oneline` (implementation commits; porch `chore` transition commits omitted):

- `8bc591e0` Add groupByStage core helper (closed canonical stage set)
- `239f3e0b` Builders tree: group by lifecycle stage, area moves to row prefix
- `cb3a26c0` Tests: groupByStage coverage + area-prefix row label
- `b0e4feb5` Extract GroupExpansionStore interface for per-mode routing
- `0e42754c` Builders: dual-axis grouping (stage|area) with mode-aware row prefix
- `98834bb4` Add Builders group-by toggle (title-bar button + setting)
- `6fe2eb89` Tests: area-mode (phase-prefix) row label coverage
- `dba2b667` Refactor: BuilderGrouping strategy per axis, provider delegates to active()
- `8fb6ed9e` Rename group-tree-item field areaName -> groupName (honest generic key)
- `d0ba348b` Tests: BuilderGrouping strategies; builderRowLabel as pure prefix formatter
- `c11aec05` Use $(milestone) icon for the Group-by-Phase toggle
- (plus plan/thread doc commits)

## Test Results

- `npm run build` (porch check): ✓ pass
- `npm test` (porch check, `@cluesmith/codev` suite): ✓ pass (3210 passed, 13 pre-existing skips)
- vscode `check-types`: ✓ pass · `compile` (esbuild + full-src eslint): ✓ pass
- vscode vitest: ✓ pass (261 tests, 20 files; new `phase-grouping` + `builder-grouping` suites, reworked `builder-row`)
- Manual verification (human, at `dev-approval` gate): ran the worktree; confirmed stage grouping, the title-bar toggle flipping both the grouping and the row prefix, per-mode collapse persistence, and Backlog unaffected.

> Note: porch's `build`/`test` checks exercise `@cluesmith/codev-core` + `@cluesmith/codev`, **not** the `codev-vscode` package. The vscode side was verified manually (check-types + compile + vitest + eslint, all green) — flagged so a reviewer knows the green porch gate doesn't itself certify the vscode build.

## Architecture Updates

No `codev/resources/arch.md` changes needed — this is a view-layer feature (Builders tree grouping) that introduces no new module boundary, service, or cross-package contract. `arch.md` has no Builders-tree-grouping section to amend, and per the arch-doc discipline a localized view feature doesn't belong there.

## Lessons Learned Updates

Three lessons added to `codev/resources/lessons-learned.md` (UI/UX section), all tagged `[From #952]`:

1. **Bound an open enum, don't enumerate it** — grouping a UI by a growing enum (protocol phases) should map onto a closed canonical set (`PHASE_TO_STAGE` → 6 stages) so the group count stays constant as the catalog grows, with a bounded `unknown` catch-all.
2. **Two-equal-modes view control** — use two commands with mutually-exclusive `when`-clauses (distinct icon per target), the VSCode built-in pattern; the single-button `toggled` property fits genuine on/off toggles, not a two-mode axis swap.
3. **Strategy-per-mode over scattered flag-branching** — when several behaviors vary together per mode, bundle them behind one strategy object and delegate via `active()`.

## Things to Look At During PR Review

- **`PHASE_TO_STAGE` mapping** (`phase-grouping.ts`) — the design-sensitive part. Note `investigate → plan` (architect-confirmed: pre-build diagnosis, right for BUGFIX) and `verify`/`verified`/`complete → verified` (in-progress verify merged with terminal). An unmapped future phase → `unknown` (bounded), so adding a protocol with a new phase is graceful but should add a `PHASE_TO_STAGE` entry to get a real bucket.
- **pr-gate vs pr-phase nuance** — only AIR/BUGFIX model `pr` as a *phase* (→ `PR` group); PIR/SPIR keep `pr` as a *gate* on the `review` phase, so a PIR/SPIR builder awaiting merge sits under `REVIEW`, not `PR`. Intentional (faithful to each protocol's own phase model), not a bug.
- **Row relocation is new behavior** — because stage is time-varying (unlike the static area axis), a builder *jumps* between groups as it advances; VSCode has no node-move animation. Stable `item.id` preserves the row's sub-state across the move. Watch the folded-destination edge (advancing into a collapsed stage hides the row until expanded).
- **Strategy `expansion` routing** (`builders.ts`) — `persistAreaGroupExpansion` captures `.expansion` once at registration, so the routing wrapper (delegating to `active().expansion`) must be a stable object, not a getter. Per-axis stores use separate `workspaceState` keys; area reuses the original key so pre-#952 collapse state survives.
- **Scope note** — a follow-up to explore standardizing the toggle concept across the extension (the `toggled` single-button pattern applied to all toggles) was raised to the architect as a separate `area/vscode` item, intentionally out of scope here.

## How to Test Locally

For reviewers pulling the branch:

- **View diff**: VSCode sidebar → right-click builder pir-952 → **View Diff**
- **Run dev server**: VSCode sidebar → **Run Dev Server**, or `afx dev pir-952`
- **What to verify**:
  - Builders tree groups by stage in lifecycle order (`SPECIFY → … → VERIFIED`), empty stages hidden, counts accurate.
  - Each row reads `[<area>] #<id> <title>`; Uncategorized rows have no prefix.
  - Title-bar toggle: `$(tag)` (→area) in stage mode, `$(milestone)` (→phase) in area mode; clicking flips both the grouping **and** the row prefix (`[area]`↔`[phase]`).
  - Per-mode collapse state is independent across a window reload.
  - A builder blocked at `plan-approval` stays under `PLAN` with the warning-yellow `checklist` icon.
  - Backlog tree still groups by area (no regression).

> Reminder: this worktree had no `node_modules` on spawn — `pnpm install` was run, so the dev server is ready.
