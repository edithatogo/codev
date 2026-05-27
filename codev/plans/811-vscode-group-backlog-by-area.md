# PIR Plan: vscode — group backlog tree by area

## Understanding

The vscode Backlog tree (`packages/vscode/src/views/backlog.ts:27`) renders open GitHub issues as a flat list. As the repo grows, scanning the list mixes work across every product surface with no axis that mirrors how engineers coordinate. Issue #811 asks for two-level grouping by the `area/*` label namespace established by #819.

The wire already carries everything we need: `OverviewBacklogItem.area: string` (required, never `undefined`) was added by #819, projected server-side via `parseArea(issue.labels)`. The parser returns the first-alphabetical `area/*` value (with the `area/` prefix stripped), or the literal `'Uncategorized'` when no `area/*` labels are present. **The parser is policy-free** — it does NOT privilege `area/cross-cutting` (see #819's regression-guard test at `packages/codev/src/__tests__/github.test.ts:333-341`). That policy decision lives in the consumer.

The cross-cutting UX privilege ("place `area/cross-cutting` issues in their own top group") is a **view-layer convention** for this PIR. The issue body documents the tagging convention:

> Tag it `area/cross-cutting` only (don't list every individual area); the dedicated group surfaces them for coordination review.

Under this convention, an issue tagged only with `area/cross-cutting` arrives at the view with `item.area === 'cross-cutting'`. The view's grouping logic recognises that bucket and sorts it first. No additional wire field is needed for this PIR — see *Risks & Alternatives* for the "user broke the convention" case.

## Proposed Change

Convert `BacklogProvider` from a flat `TreeDataProvider<TreeItem>` into a two-level provider:

- **Root level** (`getChildren()` with no element) → one `BacklogGroupTreeItem` per non-empty area group, ordered: `cross-cutting` → alphabetical specific areas → `Uncategorized`. Label format: `<area> (<count>)`.
- **Group level** (`getChildren(groupItem)`) → the existing `BacklogTreeItem` rows for that group, in the same intra-group order the flat view uses today (mine-first then rest, both preserving the server's order).

Add a pure helper `groupBacklogByArea(items)` (in `views/backlog.ts`) that takes `OverviewBacklogItem[]` and returns an ordered array of `{ area, items }`. Pure-functional, no VSCode dependency → unit-testable.

Group expansion state persists per area name via `vscode.Memento` (`context.workspaceState`). Default: all groups expanded. The provider reads the persisted map on each `getChildren()` root call and writes back via `onDidExpandElement` / `onDidCollapseElement` on the `TreeView`.

The Mine/All toggle (#809) is orthogonal — when it ships, its filter applies before `groupBacklogByArea` and groups are recomputed automatically.

## Files to Change

- `packages/vscode/src/views/backlog.ts:39-66` — refactor `BacklogProvider.getChildren()` to dispatch on element type; add `groupBacklogByArea(items)` exported helper; add the area-resolution rule (`cross-cutting` first, alphabetical, `Uncategorized` last). Constructor takes `vscode.Memento` for expansion-state persistence. Existing `spawnableBacklog` helper unchanged.
- `packages/vscode/src/views/backlog-tree-item.ts` — add `BacklogGroupTreeItem` class. Holds `areaName: string`, `count: number`, `contextValue: 'backlog-group'`. `collapsibleState` set from the persisted Memento map at construction.
- `packages/vscode/src/extension.ts:258` — pass `context.workspaceState` to `BacklogProvider` constructor. Wire `backlogView.onDidExpandElement` / `onDidCollapseElement` to write expansion state back when the user expands/collapses a group (gated on `element instanceof BacklogGroupTreeItem`).
- `packages/vscode/src/test/backlog.test.ts` — new test suite for `groupBacklogByArea`:
  - empty input → empty output
  - single `Uncategorized` item → single `Uncategorized` group
  - `cross-cutting` items → first group, no matter the alphabetical position
  - mixed groups → cross-cutting first, then alphabetical specifics, Uncategorized last
  - within-group order preserves input order
  - empty area groups are omitted (no `<area> (0)` headers)

## Risks & Alternatives Considered

- **Risk: convention violation.** An issue tagged with `area/auth` AND `area/cross-cutting` (against the documented convention) lands in `area = 'auth'` server-side, so the view places it under the `auth` group, not `cross-cutting`. Mitigation: rely on the documented convention; if real-world tagging shows this convention is regularly broken, a follow-up PIR can add `areas: string[]` (or `crossCutting: boolean`) to the wire and shift the cross-cutting detection into the view's `resolveArea(item)` step. Out of scope for #811 — keeping this PIR scoped to "view-level grouping over what the wire already provides" preserves #819's policy-free framework boundary.

- **Risk: backlog count badge desync.** `extension.ts:165` recomputes the view title `Backlog (N)` from `spawnableBacklog(data.backlog).length`. Grouping doesn't change that count — the same items are visible, just nested. No change needed.

- **Risk: reveal / select-by-id consumers.** If anything in the codebase calls `backlogView.reveal(item)`, the new two-level tree requires `getParent()` on the provider. Mitigation: grep first; today no consumer calls reveal on the backlog tree (`backlogView.reveal` does not appear in the codebase). If a future consumer needs it, add `getParent()` then.

- **Alternative: add `areas: string[]` wire field now (revert #819's projection).** Rejected — #819 deliberately chose the singular-string shape with explicit user feedback ("framework code must be policy-free about specific label values" + "wire-shape permissiveness then projection is a smell"). Re-adding the array shape would relitigate that decision without a concrete consumer pull. The cross-cutting convention is the cleaner answer at the cost of being convention-dependent.

- **Alternative: add `crossCutting: boolean` to the wire.** Considered. Minimally invasive (one boolean, computed server-side from raw labels), preserves #819's projection-on-server discipline, and detects convention violators. Rejected only because nothing else needs it yet — the cost (one wire-contract addition, one server populate site, one test) isn't justified by the convention-violator edge case alone. Worth filing as a small issue if the convention proves brittle in practice.

- **Alternative: toggle to disable grouping.** Issue §6 (`### 6. No toggle`) explicitly rejects this — grouping is the default, and repos without `area/*` labels see everything under `Uncategorized` (functionally identical to today). Aligns with #818 which DOES have a toggle for builders; the asymmetry is intentional (the issue argues the backlog grouping is zero-cost so no toggle is needed).

## Test Plan

### Unit tests (`packages/vscode/src/test/backlog.test.ts`)

Add a `suite('groupBacklogByArea', ...)` covering:

- Empty input → empty array.
- Single uncategorized item → one group with key `'Uncategorized'`, count 1.
- `[area/cross-cutting]` alone → first (and only) group is `'cross-cutting'`.
- Mixed: `auth`, `cross-cutting`, `tower`, `Uncategorized` → order is `['cross-cutting', 'auth', 'tower', 'Uncategorized']`.
- Two alphabetical-specific areas + cross-cutting → `['cross-cutting', <alphabetically-first>, <alphabetically-second>]`, no Uncategorized header rendered.
- Within-group order preserves input order (do not re-sort items).
- Empty groups are omitted (no `(0)` headers).

### Manual verification at `dev-approval` gate

Reviewer launches `afx dev pir-811` and inspects the VSCode sidebar:

1. **Default rendering**: Backlog view shows headers like `vscode (20)`, `tower (4)`, etc. Click a header to expand → issue rows render underneath. Headers ordered: `cross-cutting` first if present, then alphabetical, `Uncategorized` last.
2. **Single-issue cross-cutting**: pick an issue tagged with only `area/cross-cutting` (e.g. #854 today) → confirm it lives under the `cross-cutting` group.
3. **Uncategorized fallback**: any issue with no `area/*` labels → confirm it's under `Uncategorized` (last position).
4. **Click → view**: clicking a row still opens the issue via `codev.viewBacklogIssue`. Right-click → context-menu actions (spawn, open in browser, copy issue number) all still work.
5. **Expansion persistence**: collapse a group, reload the VSCode window → that group stays collapsed.
6. **No regression on dashboard**: open the web dashboard's Backlog view (`packages/dashboard/src/components/BacklogList.tsx`) → still renders as a flat list (no wire changes, no breakage).
7. **Empty repo**: temporarily filter the test fixture to a repo with no `area/*` labels → everything under `Uncategorized`, no other groups.
