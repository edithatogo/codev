# PIR #809 Thread — vscode backlog mine/all toggle

## Plan phase
- Issue: add a Mine/All toggle to the Backlog view title bar with `codev.backlogShowAll` config flag (default false = mine-only).
- Pattern: two-commands + one config flag + paired `when` clauses, mirroring `codev.buildersAutoCollapse` / `codev.buildersFileViewAsTree`.
- Plan committed to `codev/plans/809-vscode-backlog-view-toggle-bet.md`.
- Filter lives in `BacklogProvider.orderedSpawnable` (the single chokepoint feeding both root and per-group rendering).
- Empty-state placeholder renders only when `currentUser` is known AND filter yields zero — avoids confusing the not-yet-loaded path.
- Awaiting `plan-approval`.
