# PIR Plan: Group Builders Tree by Area (mirror #811, dedup primitives)

## Understanding

The VSCode `Codev: Builders` tree (`packages/vscode/src/views/builders.ts:89`) is flat today. The `area/*` label namespace — already projected onto `OverviewBuilder.area` (single string, `'Uncategorized'` default) by #819 — is the right grouping axis. **The exact pattern was shipped in PR #886 (sibling #811) on 2026-05-27** for the Backlog view; this issue applies the same pattern to Builders.

The design has converged to a deliberately simpler shape than #818's original framing:

- **Pure alphabetical group ordering, `Uncategorized` last** — no `cross-cutting` privilege, no priority-areas knob, no configurable preference. Framework-neutrality discipline from #819.
- **No toggle** — grouping is the only mode. Single-`Uncategorized` flatten optimization (below) makes "off" unnecessary for repos that don't use `area/*` labels.
- **Single-`Uncategorized` flatten** — when the only group is `Uncategorized`, render builder rows directly at root with no group header. Zero visual regression for unlabeled repos.
- **Per-area expand/collapse state persists via `workspaceState`**, paired with backlog's `codev.backlogGroupExpansion`.

### Scope choice: refactor first, then add the consumer

Adding Builders as a second consumer of an inlined-once-helper pattern would commit ~67 LOC of structural duplication across 5 surfaces (helper, TreeItem class, flatten predicate, expansion store, wiring). The cheapest moment to extract is *the moment the second consumer lands* — before drift starts. This plan therefore:

1. Extracts three primitives shared by both views,
2. Migrates the already-shipped backlog code onto them (mechanical),
3. Wires the new Builders consumer onto the same primitives.

The acceptance criterion "Rule structurally identical to #811's" becomes literally true (same function call, same class), not merely-prose-identical.

### Wire-field note

Revised #818 body says `OverviewBuilder.areas[]` (plural) in places, but #886 actually ships against `OverviewBuilder.area: string` (single, projected via `parseArea` — first-alphabetical wins). `views/backlog.ts:37` reads `item.area`. I'll mirror that. If the architect prefers re-introducing the plural shape, that's a wire change against #819, not this view.

## Proposed Change

### 1. Extract three shared primitives

#### 1a. `packages/core/src/area-grouping.ts` (new) — generic `groupByArea`

```ts
import { UNCATEGORIZED_AREA } from './constants.js';

/**
 * Bucket items by their resolved area, returning groups in canonical
 * Codev order: alphabetical specific areas first, then `Uncategorized`
 * last. Within each group, the input order is preserved (the caller
 * has already applied any sort policy — display-order for builders,
 * mine-first for backlog).
 *
 * Pure, generic over the item type. Both `views/backlog.ts` and
 * `views/builders.ts` consume this directly; future consumers
 * (dashboard equivalents, etc.) reuse the same function.
 */
export function groupByArea<T>(
  items: T[],
  getArea: (item: T) => string,
): Array<{ area: string; items: T[] }> {
  const buckets = new Map<string, T[]>();
  for (const item of items) {
    const area = getArea(item);
    const bucket = buckets.get(area);
    if (bucket) bucket.push(item);
    else buckets.set(area, [item]);
  }

  const result: Array<{ area: string; items: T[] }> = [];
  const uncategorized = buckets.get(UNCATEGORIZED_AREA);
  const specifics = [...buckets.keys()].filter(a => a !== UNCATEGORIZED_AREA).sort();
  for (const area of specifics) result.push({ area, items: buckets.get(area)! });
  if (uncategorized) result.push({ area: UNCATEGORIZED_AREA, items: uncategorized });
  return result;
}
```

Re-exported from the core barrel.

Tests in `packages/core/src/__tests__/area-grouping.test.ts` cover: empty input, single Uncategorized item, alphabetical specifics + Uncategorized last, omits empty groups, preserves input order within a group, multiple items per area. Adapted from the existing `suite('groupBacklogByArea')` in `test/backlog.test.ts:43-100` — same behavioural invariants, now generic.

#### 1b. `packages/vscode/src/views/area-group-tree-item.ts` (new) — base class

```ts
import * as vscode from 'vscode';

export type AreaGroupKind = 'backlog' | 'builder';

/**
 * Shared base for area-group header rows in the Backlog and Builders
 * trees. The `kind` discriminator drives both the stable `id` prefix
 * (so VSCode persists per-group expansion across cache ticks) and the
 * `contextValue` (so per-view context menus can scope cleanly).
 *
 * Concrete subclasses (`BacklogGroupTreeItem`, `BuilderGroupTreeItem`)
 * are thin tags around this base — they exist to preserve `instanceof`
 * discrimination in `extension.ts`'s per-view onDidExpand/Collapse
 * handlers, where each view must persist only its own groups.
 */
export class AreaGroupTreeItem extends vscode.TreeItem {
  constructor(
    public readonly areaName: string,
    public readonly kind: AreaGroupKind,
    count: number,
    collapsibleState: vscode.TreeItemCollapsibleState,
  ) {
    super(`${areaName} (${count})`, collapsibleState);
    this.id = `${kind}-group:${areaName}`;
    this.contextValue = `${kind}-group`;
  }
}
```

Thin subclasses:

```ts
// backlog-tree-item.ts
export class BacklogGroupTreeItem extends AreaGroupTreeItem {
  constructor(areaName: string, count: number, state: vscode.TreeItemCollapsibleState) {
    super(areaName, 'backlog', count, state);
  }
}

// builder-tree-item.ts
export class BuilderGroupTreeItem extends AreaGroupTreeItem {
  constructor(areaName: string, count: number, state: vscode.TreeItemCollapsibleState) {
    super(areaName, 'builder', count, state);
  }
}
```

Existing callers (`new BacklogGroupTreeItem(area, count, state)`) keep the same constructor signature — no migration churn at call sites.

#### 1c. `packages/vscode/src/views/area-group-expansion.ts` (new) — store + wiring helper

```ts
import * as vscode from 'vscode';
import { AreaGroupTreeItem } from './area-group-tree-item.js';

/**
 * Per-area expand/collapse state, persisted in `workspaceState`. One
 * instance per view (each view scopes its own key, e.g.
 * `codev.backlogGroupExpansion` / `codev.buildersGroupExpansion`),
 * so users can collapse a `vscode` group in Builders without affecting
 * the same group in Backlog.
 */
export class AreaGroupExpansionStore {
  constructor(
    private readonly workspaceState: vscode.Memento,
    private readonly storageKey: string,
  ) {}

  read(): Record<string, boolean> {
    return this.workspaceState.get<Record<string, boolean>>(this.storageKey, {});
  }

  set(areaName: string, expanded: boolean): void {
    const map = this.read();
    map[areaName] = expanded;
    this.workspaceState.update(this.storageKey, map);
  }
}

/**
 * Wire a TreeView's expand/collapse events into an
 * AreaGroupExpansionStore. The `GroupClass` parameter is the
 * view-specific subclass (`BacklogGroupTreeItem` or
 * `BuilderGroupTreeItem`); the `instanceof` check ensures each store
 * only records events from its own view's groups, even though both
 * views ultimately produce `AreaGroupTreeItem`-derived rows.
 */
export function wireAreaGroupExpansion(
  view: vscode.TreeView<vscode.TreeItem>,
  GroupClass: new (...args: never[]) => AreaGroupTreeItem,
  store: AreaGroupExpansionStore,
): vscode.Disposable[] {
  return [
    view.onDidExpandElement((e) => {
      if (e.element instanceof GroupClass) store.set(e.element.areaName, true);
    }),
    view.onDidCollapseElement((e) => {
      if (e.element instanceof GroupClass) store.set(e.element.areaName, false);
    }),
  ];
}
```

### 2. Migrate `views/backlog.ts` onto the shared primitives

Mechanical replacement (`views/backlog.ts:32-60, 107-111, 185-187`):

- Drop inline `groupBacklogByArea` — replace with `groupByArea(items, i => i.area)` at the one call site.
- Drop inline `setGroupExpanded` / `readExpansionState` / `EXPANSION_STATE_KEY` — replace with `private readonly expansion = new AreaGroupExpansionStore(workspaceState, 'codev.backlogGroupExpansion')`. Replace `setGroupExpanded` callers with `this.expansion.set(...)`; replace `readExpansionState` callers with `this.expansion.read()`.
- `BacklogGroupTreeItem` body shrinks to the thin subclass shown above.

Net: `views/backlog.ts` loses ~45 LOC; `backlog-tree-item.ts` loses ~7 LOC. Behaviour byte-identical.

`packages/vscode/src/test/backlog.test.ts`: drop the `suite('groupBacklogByArea')` block (lines 43-100). The same invariants are tested in `packages/core/src/__tests__/area-grouping.test.ts` against the generic. `suite('spawnableBacklog')` stays.

### 3. Apply to `views/builders.ts` (this issue's primary deliverable)

`BuildersProvider` gains the two-level shape mirroring `BacklogProvider` after migration:

- **Constructor**: `(overviewCache, builderDiffCache, workspaceState)`. The new `workspaceState` field constructs `private readonly expansion = new AreaGroupExpansionStore(workspaceState, 'codev.buildersGroupExpansion')`.
- **`getChildren(element?)`**: existing branches for `BuilderTreeItem` / `BuilderFolderTreeItem` / `BuilderFileTreeItem` are unchanged. New branches:
  - `BuilderGroupTreeItem` → `rowsForGroup(areaName)`
  - root → `rootChildren()`
- **`rootChildren()`**:
  ```ts
  const ordered = orderForDisplay(data.builders, now);
  const groups = groupByArea(ordered, b => b.area);
  if (groups.length === 1 && groups[0].area === UNCATEGORIZED_AREA) {
    return groups[0].items.map(b => this.makeBuilderRow(b, now));
  }
  const expansion = this.expansion.read();
  return groups.map(g => new BuilderGroupTreeItem(
    g.area,
    g.items.length,
    (expansion[g.area] ?? true) ? vscode.TreeItemCollapsibleState.Expanded
                                : vscode.TreeItemCollapsibleState.Collapsed,
  ));
  ```
- **`rowsForGroup(areaName)`**: recompute `orderForDisplay` → `groupByArea` → find matching group → `map(makeBuilderRow)`. Matches backlog's `orderedSpawnable` recompute pattern (`backlog.ts:113-147`).
- **`makeBuilderRow(b, now)`**: extract today's per-builder rendering (`builders.ts:89-136`) into a single helper. No behaviour change.
- **`getParent`** — see §4.

`BuilderGroupTreeItem` is added in `views/builder-tree-item.ts` (thin subclass of `AreaGroupTreeItem`, as shown in §1b).

### 4. `getParent` for accordion `reveal()` (Builders-only divergence)

The Builders accordion (`extension.ts:310`) calls `buildersView.reveal(builderItem, { expand: 3 })`. With groups inserted, `reveal` needs a real parent chain — today's `getParent(): undefined` breaks the accordion in grouping mode.

Solution: a `Map<builderId, BuilderGroupTreeItem>` populated by `rootChildren()` whenever it returns groups (multi-group case). `getParent(BuilderTreeItem)` returns the cached group; `getParent` for everything else (and in single-`Uncategorized` flatten, where builders are root again) returns `undefined`. Backlog has no equivalent need (no accordion on backlog rows) — this stays a Builders-only concern.

### 5. Wire `onDidExpand/CollapseElement` in `extension.ts`

After migration, the existing backlog wiring (`extension.ts:261-271`) becomes:

```ts
context.subscriptions.push(...wireAreaGroupExpansion(
  backlogView, BacklogGroupTreeItem, backlogProvider.expansion,
));
```

(Or the provider exposes the store via a getter — minor API call.)

Add immediately after `buildersView` creation:

```ts
context.subscriptions.push(...wireAreaGroupExpansion(
  buildersView, BuilderGroupTreeItem, buildersProvider.expansion,
));
```

Existing `buildersView.onDidExpandElement` accordion handler (line 297) is untouched — its `instanceof BuilderTreeItem` guard already ignores group rows.

### 6. Single-Uncategorized flatten: kept per-provider (deliberate)

Both providers carry the 6-LOC flatten predicate inline (`backlog.ts:124-126` and the equivalent in builders' `rootChildren`). Not extracted because the predicate's body calls a view-specific row-builder (`makeRow(item)` for backlog, `makeBuilderRow(b, now)` for builders). Extracting it cleanly would require an abstract provider with generics — disproportionate complexity for 6 LOC. Accepted as the residual duplication after the three extractions above.

### 7. Out of scope

- Configurable priority-areas mechanism
- Hardcoded `area/cross-cutting` or any area-name privilege
- Toggle to disable grouping
- Grouping by `type:*` / `priority:*` / any non-area axis
- Duplicating a builder under multiple area groups
- Per-builder user-pickable primary area override
- Dashboard equivalent (no existing dashboard consumer of `builder.area` — but the `groupByArea` extraction is the future hook)
- Header capitalization (`vscode` → `Vscode`) — tracked separately in #885
- Abstract `AreaGroupedProvider` base class — would extract the single-Uncategorized flatten too; rejected as over-engineering for 6 LOC of remainder

## Files to Change

### New
- `packages/core/src/area-grouping.ts` — generic `groupByArea<T>(items, getArea)`.
- `packages/core/src/__tests__/area-grouping.test.ts` — six tests adapted from `test/backlog.test.ts`'s `groupBacklogByArea` suite.
- `packages/vscode/src/views/area-group-tree-item.ts` — base `AreaGroupTreeItem` with `kind: 'backlog' | 'builder'` discriminator.
- `packages/vscode/src/views/area-group-expansion.ts` — `AreaGroupExpansionStore` class + `wireAreaGroupExpansion` helper.

### Modified — refactor (touches backlog)
- `packages/core/src/index.ts` (or barrel) — re-export `groupByArea`.
- `packages/vscode/src/views/backlog.ts` — drop inline `groupBacklogByArea` and inline expansion-state plumbing; consume `groupByArea` + `AreaGroupExpansionStore`.
- `packages/vscode/src/views/backlog-tree-item.ts` — `BacklogGroupTreeItem` becomes a thin subclass of `AreaGroupTreeItem` (~4 LOC).
- `packages/vscode/src/extension.ts:261-271` — replace inline `onDidExpand/CollapseElement` wiring with `wireAreaGroupExpansion(backlogView, BacklogGroupTreeItem, backlogProvider.expansion)`.
- `packages/vscode/src/test/backlog.test.ts` — drop `suite('groupBacklogByArea')` (covered now in core). `suite('spawnableBacklog')` stays.

### Modified — new consumer (the original #818 goal)
- `packages/vscode/src/views/builders.ts` — two-level `BuildersProvider`; consume `groupByArea` + `AreaGroupExpansionStore`; add `getParent` with group-cache; widen constructor to take `workspaceState: vscode.Memento`; extract `makeBuilderRow` from existing per-row rendering.
- `packages/vscode/src/views/builder-tree-item.ts` — add `BuilderGroupTreeItem` thin subclass.
- `packages/vscode/src/extension.ts:255` — pass `context.workspaceState` to `new BuildersProvider(...)`; add `wireAreaGroupExpansion(buildersView, BuilderGroupTreeItem, buildersProvider.expansion)`.
- `packages/vscode/src/test/builders.test.ts` — no new grouping-specific tests (covered by `area-grouping.test.ts` in core). Existing `orderForDisplay` and `isIdleWaiting` suites untouched.

### Not touched
- `packages/types/`, `packages/codev/` — no wire changes. `OverviewBuilder.area` and `OverviewBacklogItem.area` already populated by #819.
- `packages/vscode/package.json` — no new settings, commands, or menu entries.

## Risks & Alternatives Considered

### Risks

- **Refactor scope on a shipped #886.** Touching `views/backlog.ts` / `backlog-tree-item.ts` / `test/backlog.test.ts` in the same PR as the Builders change. Mitigation: the refactor is mechanical (drop-in replacement of inlined-once code with a shared call); behaviour preserved by the test suite (which moves but tests the same invariants); reviewer can read the backlog diff as a no-op-by-construction.
- **Accordion `reveal()` regression in grouping mode.** Addressed by the `getParent` + per-render group-cache map. Manually validated at the `dev-approval` gate.
- **`AreaGroupTreeItem`'s shared base means `instanceof AreaGroupTreeItem` would match both views' groups.** Mitigated by the thin subclasses + `instanceof BacklogGroupTreeItem` / `instanceof BuilderGroupTreeItem` discriminators in `wireAreaGroupExpansion`. Each store sees only its own view's events.
- **`workspaceState` key collision.** `codev.backlogGroupExpansion` (existing) and `codev.buildersGroupExpansion` (new) are distinct, namespaced under `codev.`. No collision.
- **Single-Uncategorized flatten makes `getParent` semantics differ between modes** in Builders. Handled — group-cache is empty in flatten mode → `getParent(builderItem)` returns `undefined` (today's behaviour) → accordion works unchanged on that branch.

### Alternatives Considered

- **Skip the refactor; mirror #886 inline (v2 of this plan).** Rejected per user direction: the second consumer is the natural extraction moment.
- **Extract only `groupByArea` (the largest single block); leave TreeItem + expansion-store duplicated.** Rejected as half-measure — the TreeItem and expansion-store extractions are each cheaper than the helper extraction and remove drift risk on the parts most likely to evolve (per-group context menus, expansion-state keys).
- **Extract an abstract `AreaGroupedProvider` base** that hosts `rootChildren` / `rowsForGroup` / single-Uncategorized flatten with a generic row factory. Rejected — saves 6 LOC at the cost of generics over (item type, row type, group subclass), which would obscure the providers more than the duplication costs. Re-evaluate if a third consumer lands.
- **Use `OverviewBuilder.areas[]` (plural) per revised issue prose.** Rejected — #886 ships against single `.area`; matching wire-shape consistency wins over copying the issue's prose verbatim.

## Test Plan

### Unit (CI + local `pnpm test`)

- `packages/core/src/__tests__/area-grouping.test.ts` — six tests covering `groupByArea<T>`:
  1. empty in → empty out
  2. single Uncategorized item → one Uncategorized group
  3. mixed inputs → alphabetical specifics then Uncategorized last
  4. omits empty area groups (no `<area> (0)` headers)
  5. preserves input order within a group (no internal re-sort)
  6. multiple items per area grouped correctly
- `packages/vscode/src/test/backlog.test.ts` — `suite('spawnableBacklog')` retained; `suite('groupBacklogByArea')` removed (covered above). Backlog provider regression risk caught by the core tests + manual review of the mechanical migration.
- `packages/vscode/src/test/builders.test.ts` — `suite('orderForDisplay')` and `suite('isIdleWaiting')` retained, untouched. No new grouping-specific tests at vscode level (the generic helper carries the behavioural coverage).

### Manual (`dev-approval` gate)

Reviewer runs `afx dev pir-818` and exercises in the running VSCode instance:

- **Backlog regression check** (refactor surface): open the Backlog view; verify groups render exactly as they did on main (alphabetical, Uncategorized last, count suffix, expand state persists across reloads). The refactor must be invisible from the user's seat.
- **Builders grouping** (new): open the Builders view; verify the same group-header style applied. Cross-check with the Backlog view — same alphabetical order, same Uncategorized-last placement, same per-group collapse persistence.
- **Within-group ordering**: ensure a blocked builder still sorts above active builders within its area group (preserves `orderForDisplay()`).
- **Accordion in grouping mode**: with `codev.buildersAutoCollapse` on (default), expand a builder's changed-files diff. Verify other builders auto-collapse — across groups too, not just within the same group.
- **Per-group expand/collapse persistence**: collapse one group. Reload the window. Verify the group is still collapsed. Expand it; reload; verify expanded. Verify backlog and builders independently — collapsing `vscode` in Backlog must not affect `vscode` in Builders (separate `workspaceState` keys).
- **Single-Uncategorized flatten**: covered by unit tests. Hard to reproduce on this repo (every issue is labelled); reviewer can verify by reading the test case.
- **Reactivity**: add or remove an `area/*` label on a builder's underlying issue via `gh issue edit`. Wait for the next `OverviewCache` SSE tick (≤60s) and confirm the builder migrates between groups.

### Cross-platform

N/A — VSCode-only change, runs identically across OSes.
