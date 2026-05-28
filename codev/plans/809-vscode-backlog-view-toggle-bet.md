# PIR Plan: Backlog View Mine/All Toggle

## Understanding

The Backlog view in the VS Code extension currently renders every open GitHub issue (`packages/vscode/src/views/backlog.ts:62-85`). Items assigned to the current user (auto-detected via `OverviewData.currentUser`) are sorted to the top of each `area/*` group and shown with the `account` icon (`backlog.ts:98-116, 123-132`); everything else shows the `issues` icon. The user has to scan the full list to find their own work.

The issue asks for a title-bar toggle that flips between "mine only" (default) and "show all", following the existing two-commands-one-config-flag pattern used for `codev.buildersAutoCollapse` and `codev.buildersFileViewAsTree` (`extension.ts:601-608`, `package.json:92-111, 368-387, 556-565`).

## Proposed Change

Add a `codev.backlogShowAll` boolean config (default `false`) and two paired commands (`codev.showBacklogAll`, `codev.showBacklogMineOnly`) registered as `view/title` actions on `codev.backlog`. The config is mirrored to a `setContext` key so the menu `when` clauses can swap the visible icon. `BacklogProvider` reads the config and applies a filter predicate inside its existing root/group rendering paths. When `currentUser` is unavailable, the filter falls back to showing all items (avoids an empty view when `gh` isn't authenticated). When mine-only mode filters everything out, the root renders a single non-clickable placeholder row.

Why this approach over alternatives: it reuses the convention already established for the two other view-title toggles in the extension verbatim — same config-flag-plus-paired-commands shape, same `setContext`-key wiring, same `onDidChangeConfiguration` listener that calls `provider.refresh()`. That keeps the cognitive cost of "another toggle" near zero and matches the issue body's explicit reference to the existing pattern.

## Files to Change

- `packages/vscode/package.json`
  - `contributes.commands`: add `codev.showBacklogAll` (title `Codev: Show All Backlog Items`, icon `$(eye)`) and `codev.showBacklogMineOnly` (title `Codev: Show Only My Backlog Items`, icon `$(eye-closed)`). Icon choice: `eye`/`eye-closed` reads as a visibility filter and is distinct from the `account`/`issues` per-row icons.
  - `contributes.menus["view/title"]`: add two entries for `codev.backlog` with the `when` clauses from the issue (`view == codev.backlog && !codev.backlogShowAll` for the `showBacklogAll` button, `view == codev.backlog && codev.backlogShowAll` for `showBacklogMineOnly`). Group `navigation`. Place adjacent to the existing `codev.refreshOverview` entry for `codev.backlog` (`package.json:393-397`).
  - `contributes.configuration.properties`: add `codev.backlogShowAll` (boolean, default `false`, description matching the other toggles' tone).

- `packages/vscode/src/extension.ts`
  - Register the two commands alongside the existing toggle commands (`extension.ts:601-608`). Each updates `codev.backlogShowAll` via `vscode.ConfigurationTarget.Global`.
  - Add a `readBacklogShowAll()` helper and the matching `setContext` seeding + `onDidChangeConfiguration` listener, mirroring the file-view-as-tree block (`extension.ts:326-334`). On config change: update the context key AND call `backlogProvider.refresh()`. Lift the `backlogProvider` binding out of the `{ ... }` block (it's currently a `const` declared at `extension.ts:250` — already in scope at the listener site).

- `packages/vscode/src/views/backlog.ts`
  - Add `refresh(): void { this.changeEmitter.fire(); }`, matching `BuildersProvider.refresh()` (`views/builders.ts:74-76`).
  - Add a private `filterToMine(items, data)` helper that returns the filtered list when `backlogShowAll === false` AND `currentUser` is present; otherwise returns the input unchanged. Call it once inside `orderedSpawnable` (which is the single chokepoint feeding both `rootChildren` and `rowsForGroup`).
  - Add an empty-state branch in `rootChildren()`: if the post-filter `items` array is empty AND the config is in mine-only mode AND `currentUser` was present (i.e. the user is genuinely seeing zero items, not just a pre-data render), return a single `vscode.TreeItem` whose label is `(no backlog items assigned to you — click the eye icon to see all)` and whose `command` is undefined (non-clickable). The existing "no data" path (`!data` → return `[]`) stays untouched so a not-yet-loaded view still renders nothing rather than the placeholder.

- `packages/vscode/tests/unit/views/backlog.test.ts` (existing file — read first; if no existing tests cover `rootChildren`/`orderedSpawnable`, add a small suite)
  - Test: mine-only mode filters out non-assigned items.
  - Test: mine-only mode with no `currentUser` (gh unavailable) returns all items.
  - Test: show-all mode returns all items regardless of `currentUser`.
  - Test: mine-only mode with zero matches renders the placeholder row.
  - Test: existing icon-swap behavior on assigned items is preserved in show-all mode.

## Risks & Alternatives Considered

- **Risk: config change doesn't re-render the tree.** Mitigation: explicit `backlogProvider.refresh()` in the `onDidChangeConfiguration` listener (same fix pattern used at `extension.ts:333`).
- **Risk: empty state when `currentUser` is briefly unset on first load** (e.g. before overview data arrives). Mitigation: the empty-state placeholder only renders when `currentUser` is present and the filter yields zero — otherwise the view falls back to showing all items. Pre-data state (`!data`) returns `[]` unchanged.
- **Risk: the `account` icon becomes redundant in mine-only mode** (every visible row is "yours"). Decision: keep the icon-swap logic unchanged per the acceptance criterion "no regression to the existing icon-swap behavior". In mine-only mode every row shows `account`, which is informative-but-redundant — acceptable, and changing it would break the show-all behavior the criterion guards.
- **Alternative: single command that flips state, with a stateful icon.** Rejected — VS Code menu `when` clauses can't easily express "show this icon variant when X" within a single command, so the two-commands pattern is what the rest of the extension uses.
- **Alternative: store toggle state in `workspaceState` instead of config.** Rejected — config is per-user across windows (matches the issue's "persists across VS Code restarts" criterion globally, not per-workspace) and matches the precedent set by the two existing toggles.
- **Alternative: filter inside `spawnableBacklog`.** Rejected — that helper is also consumed by tests / potentially other call sites; mine-only filtering is a view-layer concern, so it belongs inside `BacklogProvider`.

## Test Plan

**Unit (Vitest, packages/vscode/tests/unit/views/backlog.test.ts):**
- Cover the four filter cases enumerated under Files to Change.

**Manual (at the `dev-approval` gate, via `afx dev pir-809`):**
1. Default state on first install: open the Backlog view. Title bar shows the `$(eye)` "show all" icon. Tree shows only issues assigned to me. If the assigned set is empty, the placeholder row is visible.
2. Click the `$(eye)` icon → list expands to all open issues, icon flips to `$(eye-closed)`. Assigned items still show the `account` icon, others show `issues`.
3. Click `$(eye-closed)` → list filters back to mine-only.
4. Restart VS Code (Developer: Reload Window). Toggle state persists.
5. Sign out of `gh` (or temporarily break auth) and reload the overview. With `currentUser` null, the view renders all items regardless of toggle state — no empty-view trap.
6. With assigned items present and the toggle in mine-only mode, the existing icon swap and the "assigned to you" description still appear on the rows that are mine (no regression).
7. The right-click context menu and click-to-view behaviour on rows are unchanged.

**Build/lint:** `pnpm --filter @cluesmith/codev-vscode-extension build` and `pnpm --filter @cluesmith/codev-vscode-extension lint` clean.
