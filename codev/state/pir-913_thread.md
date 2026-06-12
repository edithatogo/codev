# pir-913 thread

## Plan phase

Investigated issue #913 (Builders accordion collapses area-group headers; group expansion wrongly persisted).

Key findings beyond the issue text:

- Code drifted since filing: #952 added a second grouping axis (stage, now the default) with its own persisted key `codev.buildersStageGroupExpansion` alongside the issue's `codev.buildersGroupExpansion`. Plan removes persistence for both axes; Backlog's key stays.
- VSCode has no per-item collapse API, but changing a `TreeItem.id` makes VSCode treat the row as new and honor the provider's `Collapsed` state. Plan replaces the tree-wide `collapseAll` + reveal-repair with per-builder id salting (`collapseBuildersExcept` on the provider). Groups are never touched; the `reveal(expand:3)` folder-repair and the `reconciling` debounce become unnecessary.
- In-session group collapse memory comes free from VSCode's native per-id behavior, so no in-memory store replaces the deleted persisted one. Cross-reload defaults to expanded because contributed trees don't persist expansion natively (that's why the store existed).

Plan written to `codev/plans/913-vscode-accordion-shouldn-t-aff.md`. Sitting at plan-approval gate.
