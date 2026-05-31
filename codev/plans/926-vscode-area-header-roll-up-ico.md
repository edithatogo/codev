# PIR Plan: VSCode area-header roll-up icons (Backlog & Builders views)

## Scope (plan-gate discussion outcome)

Both the Backlog and Builders area headers get a roll-up icon — the issue's
original both-views design. We briefly considered shipping the Backlog rollup
only, but reinstated the Builders rollup for **cross-view consistency**: the two
trees are siblings in the same sidebar, both grouped by `area/*` and both built
on the shared `AreaGroupTreeItem` base. Giving one header dots and the other
none reads as unfinished. The objections to the Builders rollup
(redundant-when-expanded, green-when-healthy) apply equally to the Backlog
rollup we're keeping, so they don't justify an asymmetry. Net: **both views
always carry a header dot from the same icon vocabulary**, computed per-view.

A separate idea — keeping in-progress issues *in* the Backlog with the builder's
state icon (instead of filtering them out) — was filed as a deliberate
follow-up (#948) rather than folded in here, to keep #926 scoped and preserve
the VSCode/dashboard backlog parity.

## Understanding

The Backlog and Builders sidebar trees group rows under `area/*` headers
(e.g. `VSCODE (3)`). Today those headers carry **no icon** — the shared base
`AreaGroupTreeItem` (`area-group-tree-item.ts`) sets only `id` and
`contextValue`. An engineer scanning the collapsed tree can't tell which areas
have live builders (Builders) or which are open to spawn into (Backlog) without
expanding each group.

Issue #926 adds a **roll-up status icon** to each area header — a summary of the
children's icons. The unifying rule is "the header summarizes what's inside it,"
but the rollup *function* differs per view because the children differ:

- **Backlog children are issues** → binary "is anyone working this area?" →
  green filled dot vs. grey outline dot.
- **Builders children are builders** → worst-of-three rollup over the three
  builder-row states (blocked / idle / active), reusing the exact icons + color
  tokens already on individual builder rows (`builders.ts:206-210`).

No new colors or glyphs are introduced — every icon keeps its single existing
meaning. The detail (counts) lives in the header tooltip.

This is purely a VSCode-extension, client-side change. The overview payload
already carries `builders[]` (each with `.area`, `api.ts:182`) alongside
`backlog[]` (each with `.area`, `api.ts:222`), so both rollups are computed in
the tree providers from data already in the `OverviewCache`. No server /
overview-payload change is needed.

## Proposed Change

### Backlog view (binary rollup)

In `backlog.ts`, derive a per-area **active-builder count** from `data.builders`.
A builder counts toward an area when its `.area` matches the header's area. Pass
that count into `BacklogGroupTreeItem`; the subclass sets:

| State | Icon | Color token |
|---|---|---|
| count ≥ 1 (area has a live builder) | `circle-filled` | `testing.iconPassed` (green) |
| count = 0 (open to spawn) | `circle-outline` | `disabledForeground` (grey) |

Tooltip: `"<n> builder(s) active in <area>"` (count ≥ 1) / `"No active builders
in <area>"` (count = 0).

The green dot is the *same* dot that means "live builder" on a builder row, so
its meaning is reinforced; grey/idle areas stay muted so the eye skims for spawn
targets.

### Builders view (worst-of-three rollup)

In `builders.ts`, the provider already knows each group's builders and already
classifies `isBlocked` / `isIdle` per builder (via `isIdleWaiting`,
`builders.ts:168`). Compute a `{ blocked, idle, active }` count triple per group
and pass it into `BuilderGroupTreeItem`; the subclass picks the **worst** state
present and reuses the row icons from `builders.ts:206-210`:

| If the area has… | Icon | Color token |
|---|---|---|
| any **blocked** builder | `bell` | `notificationsWarningIcon.foreground` (yellow) |
| else any **idle/silent** builder | `comment-discussion` | `notificationsInfoIcon.foreground` (blue) |
| else (all active) | `circle-filled` | `testing.iconPassed` (green) |

This matches the existing within-group sort order (blocked → idle → active), so
the header icon always equals the topmost row's icon in the group.

Tooltip: `"<b> blocked · <i> waiting · <a> active"` — all three segments shown
(matching the issue's example) so the format is predictable regardless of which
states are present.

Because every builder group has ≥1 builder, the Builders header never shows the
grey "idle area" dot — it always shows green-or-worse. Combined with the Backlog
rollup, **both views' headers always carry a dot from the same vocabulary** —
the consistency the scope decision is built on.

### Rollup logic placement & testability

Mirror the existing exported-pure-helper pattern (`orderForDisplay`,
`spawnableBacklog`) that's unit-tested directly:

- `backlog.ts` — add exported `activeBuilderCountByArea(builders): Map<string, number>`.
- `builders.ts` — add exported `rollupGroupState(builders, now): { blocked: number; idle: number; active: number }` (reuses `isIdleWaiting`).

The providers call these and feed the result into the subclass constructors. The
**icon/tooltip assignment lives in the subclasses** (`BacklogGroupTreeItem`,
`BuilderGroupTreeItem`), per the issue's explicit instruction — *not* in the
shared `AreaGroupTreeItem` base, because the rollup differs per view.

Both providers' degenerate single-`Uncategorized` flatten branch renders no
headers, so it needs no rollup and is untouched.

## Files to Change

- `packages/vscode/src/views/backlog.ts`
  - Add exported `activeBuilderCountByArea(builders: OverviewBuilder[]): Map<string, number>`.
  - In `rootChildren()` (L96-102), compute the map once from `data.builders` and
    pass each group's count into
    `new BacklogGroupTreeItem(g.area, g.items.length, state, activeCount)`.
- `packages/vscode/src/views/backlog-tree-item.ts`
  - `BacklogGroupTreeItem` constructor gains `activeBuilderCount: number`; sets
    `this.iconPath` (circle-filled/green vs circle-outline/grey) and
    `this.tooltip`.
- `packages/vscode/src/views/builders.ts`
  - Add exported `rollupGroupState(builders, now): { blocked; idle; active }`.
  - In `rootChildren()` (L141-151), compute the triple per group and pass into
    `new BuilderGroupTreeItem(g.area, g.items.length, state, rollup)`.
- `packages/vscode/src/views/builder-tree-item.ts`
  - `BuilderGroupTreeItem` constructor gains the rollup-counts param; sets
    `this.iconPath` (worst-of bell/comment-discussion/circle-filled) and
    `this.tooltip`.
- `packages/vscode/src/views/area-group-tree-item.ts` — **no change** (rollup
  stays in subclasses, per the issue).
- Tests:
  - `packages/vscode/src/test/backlog.test.ts` — unit-test
    `activeBuilderCountByArea` (empty, single area, multi-area, multiple builders
    same area summed, Uncategorized).
  - `packages/vscode/src/test/builders.test.ts` — unit-test `rollupGroupState`
    (all-active → active; one idle → idle beats active; one blocked → blocked
    beats idle+active; mixed → counts correct).

## Risks & Alternatives Considered

- **Risk: builder `.area` and backlog `.area` projected independently.** Both
  use the same `parseArea` projection server-side, so an area string from
  `builders[]` matches the header key from `groupByArea(backlog)`. Mitigation:
  key on the raw `.area` wire value (what `groupByArea` keys on) — no client
  re-normalization.

- **Risk: "active builder" semantics (Backlog).** The Backlog rollup treats
  *any* builder in the area as "active" (the heading question is "is anyone
  working this area?"). A builder blocked at a gate still counts — it's still
  occupying the area; the Builders view is where blocked/idle nuance shows.
  Documented so a reviewer can object at the gate.

- **Known limitation (accepted, from the issue):** an area that's busy but has
  **no remaining spawnable backlog items** renders no Backlog header, so it
  can't show "working" there. Fine for the "where do I spawn?" goal. (Follow-up
  #948 would dissolve this by keeping in-progress issues in the Backlog.)

- **Alternative: drop the Builders rollup (Backlog only).** Rejected for
  cross-view consistency — see Scope. The objections to the Builders rollup
  apply equally to the Backlog rollup we keep, so an asymmetry isn't justified.

- **Alternative: exception-only Builders header** (icon only when attention
  needed). Rejected: it makes the header intermittent, which is *less*
  consistent with the always-on Backlog dot, not more.

- **Alternative: pass a boolean into `BacklogGroupTreeItem`** (issue's impl
  note). Rejected: the tooltip needs the count, and the count subsumes the
  boolean (`count > 0`).

- **Alternative: put rollup in the shared base.** Rejected per the issue — the
  two rollups differ, so they belong in the subclasses.

## Test Plan

- **Unit (the existing `src/test` suite):**
  - `activeBuilderCountByArea`: empty → empty map; two areas → correct per-area
    counts; multiple builders same area → summed; Uncategorized counted.
  - `rollupGroupState`: all active → `{0,0,n}`; one idle → idle beats active;
    one blocked → blocked beats idle+active; mix → counts correct.
  - Run: `cd packages/vscode && pnpm test`.
- **Build:** `pnpm --filter @cluesmith/codev-vscode build` (and `pnpm build`
  from root) — confirm no TS errors from the new constructor params.
- **Manual (at the `dev-approval` gate, in the VSCode Extension Host):**
  - Backlog: an area with a spawnable issue **and** a live builder → green
    filled dot; an area with only spawnable issues → grey outline dot. Hover →
    builder count.
  - Builders: a group with a builder blocked at a gate → yellow bell; worst-idle
    group → blue comment-discussion; all-active group → green filled dot. Header
    icon matches the topmost row. Hover → "b blocked · i waiting · a active".
  - Both: collapse/expand still works; single-`Uncategorized` repos render flat
    rows with no header (unchanged); both views' headers consistently carry a
    dot.
- **Cross-platform:** N/A (VSCode extension; web dashboard out of scope per the
  issue).
