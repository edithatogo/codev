# PIR Review: Mark recently-created backlog rows (< 24h)

Fixes #930

## Summary

The Backlog sidebar tree now flags freshly-filed issues: any row whose
`createdAt` is within the last 24 hours of render-time "now" leads with a
monochrome `[new]` prefix, and every row with a parseable `createdAt` gains a
`Created <age>` line on its hover tooltip. The marker is computed at render
time against a fresh `Date.now()`, so an item ages out of `[new]` on the next
tree refresh with no persistent state or per-user dismissal. The `[new]` text
prefix (rather than an icon swap) was chosen so it coexists with the existing
`account` / `issues` assignment icon — the primary goal was letting an engineer
spot a *new issue assigned to them*, which an icon swap would have hidden.

## Files Changed

- `packages/vscode/src/views/backlog-recency.ts` (+65 / -0) — new, vscode-free
  pure helpers
- `packages/vscode/src/__tests__/backlog-recency.test.ts` (+82 / -0) — new,
  vitest unit tests
- `packages/vscode/src/views/backlog.ts` (+12 / -2) — `makeRow`: `[new]` label
  prefix + `Created <age>` tooltip

## Commits

- `5ff73ac4` [PIR #930] Lead row with [new] prefix (before the issue number)
- `54637402` [PIR #930] Update thread — implement phase
- `0b03226b` [PIR #930] Render [new] prefix + Created-age tooltip on backlog rows
- `417156f9` [PIR #930] Add backlog-recency pure helpers + unit tests
- `04dcc581` [PIR #930] Plan revised — follow #810 [new]-prefix pattern
- `93b5768a` [PIR #930] Plan draft

## Test Results

- `build` (porch check): ✓ pass
- `tests` (porch check): ✓ pass
- vitest unit suite: ✓ 122 pass (9 new in `backlog-recency.test.ts`)
- `check-types` (`tsc --noEmit`): ✓ pass
- `lint` (`eslint src`): ✓ pass
- esbuild bundle: ✓ pass
- Manual verification: approved by the human at the `dev-approval` gate via the
  running worktree (Extension Development Host / dev server).

## Architecture Updates

No arch changes — this is a self-contained, additive change to one view's row
construction (`BacklogProvider.makeRow`) plus a sibling pure-helper file. It
introduces no new module boundary, data flow, or pattern: it reuses the
established "pure logic in a vscode-free file, vitest-tested in `__tests__/`,
consumed by the vscode-dependent provider" convention already set by
`backlog-filter.ts`. `codev/resources/arch.md` already documents that
convention; nothing to add.

## Lessons Learned Updates

No durable lessons captured — the implementation followed existing conventions
end to end (the `backlog-filter.ts` pure-helper pattern for testability, and
the #810 "monochrome bracket-text prefix coexisting with the row icon" design
language for the marker). One process note worth recording inline rather than
in `lessons-learned.md` (too situational to generalize): a fresh builder
worktree needs `@cluesmith/codev-core` and `@cluesmith/codev-types` built
before the vscode package's `tsc`/`esbuild` can resolve their subpath exports —
the first `porch done` failed the `build` check for exactly this reason and
passed once core+types were built. This is pre-existing worktree build-ordering
behavior (confirmed via `git stash` that the `status.ts`/`workspace.ts`/
`terminal-adapter.ts` errors exist without this diff), not introduced here.

## Things to Look At During PR Review

- **Marker coexists with the assignment icon** (`backlog.ts:124-130`): the
  `[new]` prefix leads the label while `iconPath` still dispatches `account`
  (assigned) vs `issues` (otherwise). A new + assigned row reads
  `👤 [new] #N <title> … assigned to you`. This was the resolved design call —
  an earlier draft proposed a `$(sparkle)` icon swap, rejected because it would
  clobber the assignment icon and hide newness on exactly the rows that matter.
- **Robustness of the age parse** (`backlog-recency.ts`): `isRecentlyCreated` /
  `relativeAge` both guard `Date.parse` returning `NaN` (missing / empty /
  malformed `createdAt`) and defensively treat future timestamps as
  not-recent / `0s ago`. Malformed input yields no prefix and an unchanged
  url-only tooltip — no thrown error. Covered by tests.
- **Render-driven, not timer-driven**: the marker recomputes only when the
  Backlog tree re-renders (SSE-driven `OverviewCache.onDidChange`, or a config
  refresh). There is no 24h `setTimeout`; an item drops `[new]` on the next
  refresh after crossing the threshold. This matches the issue's acceptance
  criterion #3 ("lose the marker on the next refresh") and was explicitly
  confirmed with the reviewer at the gate.
- **Duplicated relative-time format**: `relativeAge` re-implements the ~6-line
  tiered format from `view-artifact.ts:135` rather than importing it, because
  that helper lives in a vscode-dependent module and hardcodes `Date.now()`
  (not injectable for deterministic tests). The format strings match so wording
  stays consistent. A future consolidation could extract a shared
  `now`-injectable formatter, but that was out of scope here.

## How to Test Locally

- **View diff**: VSCode sidebar → right-click builder `pir-930` → **View Diff**
- **Run dev server**: VSCode sidebar → **Run Dev Server**, or `afx dev pir-930`
- **What to verify**:
  - A freshly-filed issue (< 24h) leads with `[new]` before its `#id`; hovering
    shows `Created <Xh ago>`.
  - A new issue **assigned to you** keeps its `account` icon **and** shows
    `[new]` plus the `assigned to you` description (the primary goal).
  - An older issue renders unchanged (no `[new]`); its tooltip still shows
    `Created <Xd ago>`.
  - Mine-only toggle (#809), area grouping (#811), and the title-count
    formatter (#911) all still render correctly with `[new]` prefixes present.
  - An issue with missing/malformed `createdAt` renders with no prefix and a
    url-only tooltip — no error.
