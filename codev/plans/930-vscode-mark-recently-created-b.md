# PIR Plan: Mark recently-created backlog rows (< 24h)

## Understanding

The Backlog sidebar tree (`packages/vscode/src/views/backlog.ts`) gives no
visual signal that an issue is freshly filed. Issue #930 asks for a
lightweight "new" marker on rows whose `createdAt` is within the last 24
hours of "now", re-evaluated on every tree render — no persistent state, no
per-user dismissal. After 24h the marker drops off naturally on the next
render.

The data is already present: `OverviewBacklogItem.createdAt` is a required
`string` field (`packages/types/src/api.ts:227`) and flows through the
existing overview pipeline to the extension. The entire change is confined to
row construction in `BacklogProvider.makeRow` plus a small pure helper.

The issue body resolves the UX choices to concrete defaults; I adopt them:

1. **Marker location**: icon prefix (default 1a) — swap the per-row icon to a
   "new" variant. Matches the existing visual language (`account` vs `issues`
   icon based on assignment).
2. **Icon**: `$(sparkle)` in `ThemeColor('list.highlightForeground')` so it
   picks up the user's accent color (default proposal).
3. **Threshold**: hardcoded 24h constant for v1 (no setting).
4. **Tooltip**: append `Created <relativeTime>` to the row tooltip whenever
   `createdAt` is present and parseable — regardless of whether the row is
   marked new (useful info past the 24h window too).
5. **Mine-only toggle (#809)**: filtered-out items aren't rendered, so the
   marker question never arises for them. Confirmed: `orderedSpawnable` filters
   first, then `makeRow` runs only on survivors — no special handling needed.

## Proposed Change

### 1. New pure helper file: `packages/vscode/src/views/backlog-recency.ts`

Vscode-free, mirroring the established `backlog-filter.ts` pattern so the logic
is unit-testable under the vitest harness (`__tests__/`) without dragging in
the `vscode` module. Two functions, both taking an injected `now` (ms) so tests
are deterministic — the codebase's existing `relativeTime` in
`view-artifact.ts:135` hardcodes `Date.now()` and isn't reusable for testing:

- `RECENT_THRESHOLD_MS = 24 * 60 * 60 * 1000` — the hardcoded window.
- `isRecentlyCreated(createdAt: string | undefined, nowMs: number): boolean`
  — parses `createdAt` via `Date.parse`; returns `false` on
  missing/empty/malformed (`NaN`), on future timestamps (defensive), and when
  the age is ≥ threshold. Returns `true` only when `0 ≤ age < threshold`.
- `relativeAge(createdAt: string | undefined, nowMs: number): string | null`
  — returns `null` when missing/malformed, else a relative string
  (`'3h ago'`, `'2d ago'`, `'45m ago'`, `'30s ago'`) using the same tiered
  format as `view-artifact.ts:135` so the wording stays consistent across the
  extension. Future timestamps clamp to `'0s ago'` rather than emitting a
  negative number.

### 2. `BacklogProvider.makeRow` (`backlog.ts:116-134`)

Compute `const now = Date.now()` once per row (render-time "now", satisfying
the "re-evaluated on every render" requirement). Then:

- **Icon precedence**: `account` (assigned) keeps priority — assignment is the
  stronger, action-relevant signal and already drives the icon. For an
  *unassigned* row that is recently created, use
  `new vscode.ThemeIcon('sparkle', new vscode.ThemeColor('list.highlightForeground'))`.
  Otherwise `issues`. A new+assigned row keeps the `account` icon but still
  surfaces newness via the tooltip (`Created <age>`) and the existing
  `assigned to you` description.
  *(Flagged as a design call below — see Risks.)*
- **Tooltip**: when `relativeAge(item.createdAt, now)` is non-null, set tooltip
  to `${item.url}\nCreated <age>`; otherwise keep `item.url` as today. (Use a
  `MarkdownString` or plain multi-line string — plain `\n` in a string tooltip
  renders as a second line in VSCode.)

No change to `description`, sort order, grouping, or the mine-only path.

### 3. Tests: `packages/vscode/src/__tests__/backlog-recency.test.ts`

Vitest unit tests for the two pure helpers with a fixed `now`:
- `isRecentlyCreated`: just-now, 1h ago, 23h59m ago → true; exactly 24h, 25h,
  2d ago → false; `undefined`, `''`, `'not-a-date'` → false; future → false.
- `relativeAge`: seconds/minutes/hours/days tiers; `undefined`/malformed →
  null; future → `'0s ago'`.

## Files to Change

- `packages/vscode/src/views/backlog-recency.ts` — **new**, pure helpers
  (`RECENT_THRESHOLD_MS`, `isRecentlyCreated`, `relativeAge`).
- `packages/vscode/src/views/backlog.ts:116-134` — `makeRow`: compute
  recency, swap icon for unassigned-new rows, enrich tooltip.
- `packages/vscode/src/__tests__/backlog-recency.test.ts` — **new**, vitest
  unit tests for the helpers.

Estimated net diff: ~40-60 LOC including tests. No type changes, no data-flow
changes.

## Risks & Alternatives Considered

- **Icon precedence ambiguity (the one real design call left)**: a row that is
  both *assigned to you* and *new*. I propose **assignment wins the icon**
  (keep `account`), with newness conveyed by the tooltip. Rationale: assignment
  is the durable, action-relevant signal; the sparkle is most valuable on
  *unassigned* fresh items a reviewer is triaging. **Alternative**: new wins
  the icon (sparkle), assignment stays in the description text. Reviewer can
  redirect at this gate — it's a one-line change either way.
- **`createdAt` missing/malformed**: helpers return `false`/`null`, so the row
  renders exactly as today (issues/account icon, url-only tooltip), no thrown
  error. Covered by tests. (Acceptance criterion #6.)
- **No regression to #809 / #811 / #911**: the change is purely additive inside
  `makeRow` (icon + tooltip). `orderedSpawnable` (mine-only), `groupByArea`
  (#811), and `formatBacklogTitle`/`visibleBacklogCount` (#911) are untouched.
  Existing `src/test/backlog.test.ts` and `__tests__/backlog-filter.test.ts`
  should pass unchanged.
- **Reusing the existing `relativeTime`**: rejected for the helper because it's
  in a vscode-dependent module and hardcodes `Date.now()` (untestable). I
  duplicate the ~6-line tiered format in the pure helper rather than refactor
  `view-artifact.ts` (out of scope; would widen the diff for no behavioral
  gain). The format strings match so wording stays consistent.

## Test Plan

- **Unit (vitest)**: `pnpm --filter @cluesmith/codev-vscode test` (or the
  package's vitest run) — new `backlog-recency.test.ts` covers threshold
  boundaries, malformed input, and relative-age tiers deterministically.
- **Build**: `pnpm --filter @cluesmith/codev-vscode build` (tsc) passes.
- **Manual (at dev-approval gate)**: open the Backlog view in the Extension
  Development Host. Verify:
  - A freshly-filed issue (< 24h) shows the `$(sparkle)` icon (accent-colored)
    when unassigned; hovering shows `Created <Xh ago>`.
  - An older issue renders unchanged (issues/account icon), tooltip still shows
    `Created <Xd ago>`.
  - The mine-only toggle, area grouping, and title count all still render
    correctly with markers present.
  - An item assigned to you keeps the `account` icon + `assigned to you`
    description (per the proposed precedence), tooltip shows its age.
