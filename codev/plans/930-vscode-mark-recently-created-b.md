# PIR Plan: Mark recently-created backlog rows (< 24h)

## Understanding

The Backlog sidebar tree (`packages/vscode/src/views/backlog.ts`) gives no
visual signal that an issue is freshly filed. Issue #930 asks for a
lightweight "new" marker on rows whose `createdAt` is within the last 24
hours of "now", re-evaluated on every tree render — no persistent state, no
per-user dismissal. After 24h the marker drops off naturally on the next
render.

The data is already present: `OverviewBacklogItem.createdAt` is a required
`string` field (`packages/types/src/api.ts:227`) and flows through the existing
overview pipeline to the extension. The entire change is confined to row
construction in `BacklogProvider.makeRow` plus a small pure helper — no
data-flow or type changes.

**Design decision (resolved): follow the #810 pattern, not an icon swap.**
The issue body proposed an icon-prefix marker (`$(sparkle)`). During plan
review we rejected that because the backlog row icon is *already* dispatched by
assignment (`account` when assigned-to-you, `issues` otherwise), so a "new"
icon would collide with the assignment signal — making a *new issue assigned to
you* indistinguishable from an *old* one. That defeats the feature's primary
purpose (an engineer spotting fresh items assigned to them).

Instead we adopt the design language established by #810 (builder-row
legibility), which solved the same "encode an extra categorical state without
clobbering the existing icon" problem:

| #810 decision | #930 application |
|---|---|
| Bracket-text **prefix after the issue number** (`#<id> [<phase>] <title>`) | `#<id> [new] <title>` — `[new]` prefix after the id, before the title |
| Prefix chosen because **truncation cuts the END, not the start** | `[new]` stays visible on narrow sidebars / long titles |
| Prefix is **monochrome bracket text**; icons carry color | `[new]` is plain bracket text, no color |
| **Icons untouched** where they already carry info | `account` / `issues` icons fully preserved |
| Small **extracted, unit-tested helper with a fallback** | pure `recencyPrefix(createdAt, now)` → `'[new] '` or `''`, vitest-tested |

The result coexists with assignment: a new+assigned row reads
`👤 #911 [new] <title>  …  assigned to you` — account icon kept, `[new]` added.

## Proposed Change

### 1. New pure helper file: `packages/vscode/src/views/backlog-recency.ts`

Vscode-free, mirroring the established `backlog-filter.ts` pattern so the logic
is unit-testable under the vitest harness (`__tests__/`) without importing the
`vscode` module. Both functions take an injected `now` (ms) so tests are
deterministic — the existing `relativeTime` in `view-artifact.ts:135` hardcodes
`Date.now()` and isn't reusable for testing.

- `RECENT_THRESHOLD_MS = 24 * 60 * 60 * 1000` — the hardcoded 24h window (no
  setting, per issue default 3).
- `isRecentlyCreated(createdAt: string | undefined, nowMs: number): boolean`
  — parses `createdAt` via `Date.parse`; returns `false` on
  missing/empty/malformed (`NaN`), on future timestamps (defensive), and when
  age ≥ threshold. Returns `true` only when `0 ≤ age < threshold`.
- `recencyPrefix(createdAt: string | undefined, nowMs: number): string`
  — thin wrapper: returns `'[new] '` when `isRecentlyCreated`, else `''`.
  This is the #810-analogous "categorical state → text prefix" helper, kept
  tiny and testable with a graceful empty-string fallback (mirrors #810's
  `GATE_ICONS[...] || 'bell'` fallback shape).
- `relativeAge(createdAt: string | undefined, nowMs: number): string | null`
  — returns `null` when missing/malformed, else a relative string
  (`'3h ago'`, `'2d ago'`, `'45m ago'`, `'30s ago'`) using the same tiered
  format as `view-artifact.ts:135` so wording stays consistent across the
  extension. Future timestamps clamp to `'0s ago'`.

### 2. `BacklogProvider.makeRow` (`backlog.ts:116-134`)

Compute `const now = Date.now()` once per row (render-time "now", satisfying
the "re-evaluated on every render" requirement). Then:

- **Label**: insert the `[new]` prefix between the issue number and the title.
  Current label is
  `` `#${item.id} ${item.title}${author}` ``; becomes
  `` `#${item.id} ${recencyPrefix(item.createdAt, now)}${item.title}${author}` ``.
  When not recent (or `createdAt` missing/malformed) `recencyPrefix` returns
  `''`, so the label is byte-identical to today.
- **Icons unchanged**: keep `account` (assigned) / `issues` (otherwise). No
  icon dispatch on recency at all — the whole icon-precedence design call from
  the first draft disappears.
- **Tooltip**: when `relativeAge(item.createdAt, now)` is non-null, set tooltip
  to `${item.url}\nCreated <age>`; otherwise keep `item.url` as today. (Plain
  `\n` in a string tooltip renders as a second line in VSCode.)

No change to `description`, sort order, grouping, the mine-only path, or the
icon dispatch.

### 3. Tests: `packages/vscode/src/__tests__/backlog-recency.test.ts`

Vitest unit tests for the pure helpers with a fixed `now`:
- `isRecentlyCreated`: just-now, 1h ago, 23h59m ago → true; exactly 24h, 25h,
  2d ago → false; `undefined`, `''`, `'not-a-date'` → false; future → false.
- `recencyPrefix`: recent → `'[new] '`; not-recent / malformed / undefined →
  `''`.
- `relativeAge`: seconds/minutes/hours/days tiers; `undefined`/malformed →
  `null`; future → `'0s ago'`.

## Files to Change

- `packages/vscode/src/views/backlog-recency.ts` — **new**, pure helpers
  (`RECENT_THRESHOLD_MS`, `isRecentlyCreated`, `recencyPrefix`, `relativeAge`).
- `packages/vscode/src/views/backlog.ts:116-134` — `makeRow`: insert `[new]`
  label prefix, enrich tooltip. Icons untouched.
- `packages/vscode/src/__tests__/backlog-recency.test.ts` — **new**, vitest
  unit tests for the helpers.

Estimated net diff: ~45-65 LOC including tests. No type changes, no data-flow
changes, no grouping/sorting changes.

## Risks & Alternatives Considered

- **Alternative — `$(sparkle)` icon swap (the issue's original default 1a)**:
  rejected because the row icon already encodes assignment; a recency icon
  would clobber the `account` signal and hide newness on exactly the rows that
  matter most (new + assigned-to-you). The `[new]` text prefix coexists with
  the icon. This is the same reasoning #810 used to reject letter-badges /
  `FileDecorationProvider` in favor of a text prefix beside the untouched icon.
- **Alternative — "Recent" group at the top of the backlog**: rejected as a
  structural grouping change that the issue explicitly lists under *Out of
  scope* ("Sorting changes — newly-created items don't get re-sorted to the
  top") and that would force a duplication decision (item in both Recent and
  its area group, or only in Recent). The `[new]` prefix surfaces newness
  in-place without re-sorting; with the mine-only toggle on (the #809 default)
  the list is already short and the prefix is plainly visible.
- **`createdAt` missing/malformed**: `recencyPrefix` → `''` and `relativeAge`
  → `null`, so the row renders exactly as today (no prefix, url-only tooltip),
  no thrown error. Covered by tests (acceptance criterion #6).
- **No regression to #809 / #811 / #911**: the change is additive inside
  `makeRow` (label prefix + tooltip). `orderedSpawnable` (mine-only),
  `groupByArea` (#811), and `formatBacklogTitle`/`visibleBacklogCount` (#911)
  are untouched. The title-count formatter counts items, not label text, so the
  prefix doesn't perturb it. Existing `src/test/backlog.test.ts` and
  `__tests__/backlog-filter.test.ts` pass unchanged.
- **Reusing `view-artifact.ts`'s `relativeTime`**: rejected for the helper
  because it's in a vscode-dependent module and hardcodes `Date.now()`
  (untestable). We duplicate the ~6-line tiered format in the pure helper; the
  format strings match so wording stays consistent. Refactoring
  `view-artifact.ts` to share it is out of scope (widens the diff for no
  behavioral gain).

## Test Plan

- **Unit (vitest)**: run the vscode package's vitest suite — new
  `backlog-recency.test.ts` covers threshold boundaries, malformed input,
  prefix output, and relative-age tiers deterministically.
- **Build**: the vscode package's `tsc` build passes.
- **Manual (at dev-approval gate)**: open the Backlog view in the Extension
  Development Host. Verify:
  - A freshly-filed issue (< 24h) shows `[new]` immediately after its `#id`,
    before the title; hovering shows `Created <Xh ago>`.
  - A new issue **assigned to you** keeps its `account` icon **and** shows
    `[new]` (the primary goal) plus `assigned to you` description.
  - An older issue renders unchanged (no `[new]`), tooltip still shows
    `Created <Xd ago>`.
  - Narrow the sidebar / use a long title → `[new]` stays visible while the
    title truncates (the prefix-over-suffix rationale from #810).
  - The mine-only toggle, area grouping, and title count all still render
    correctly with `[new]` prefixes present.
