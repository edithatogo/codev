# pir-812 thread — vscode Codev panel tab scaffolding

## Plan phase (2026-06-04)

Investigated `packages/vscode`. Findings:
- `contributes.viewsContainers` has only `activitybar.codev`; views wired in `src/extension.ts` ~L326–356.
- Context keys via `setContext` (precedent `codev.teamEnabled` at L507); view `when` clauses honored.
- TreeDataProvider precedent: `src/views/recently-closed.ts` (35 lines).
- package.json contributions are unit-tested: `src/__tests__/contributes-*.test.ts`.
- Verified follow-up issues: #813 Recently Closed, #814 Team, #815 Status — placeholder text matches.

Design note: `visibility: 'collapsed'` is a *view* property, not a container property. Container being collapsed is satisfied because contributing a panel container doesn't auto-open the bottom panel; placeholder view also set `visibility: collapsed`. Toggle command `workbench.view.extension.codevPanel` is auto-generated from container id.

Plan written to `codev/plans/812-vscode-introduce-a-codev-panel.md`. Awaiting plan-approval gate.
