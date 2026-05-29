# PIR #930 — mark recently-created backlog rows (< 24h)

## Plan phase

Investigated `packages/vscode/src/views/backlog.ts`. The codebase already
separates pure logic (`backlog-filter.ts`, vitest-tested in `__tests__/`) from
vscode-dependent row construction (`backlog.ts`, vscode-test in `src/test/`).
Following that pattern: new pure `backlog-recency.ts` for the age helpers,
edit `makeRow` for icon + tooltip.

`OverviewBacklogItem.createdAt` is required on the type (`api.ts:227`) and
already plumbed to the extension — confirmed via the issue + type read. No
data-flow change.

One real design call surfaced and flagged in the plan: icon precedence for a
row that is BOTH assigned-to-you AND new. Proposed assignment-wins (keep
`account` icon), newness via tooltip. Reviewer can flip it at the gate.

Plan written, committed, awaiting `plan-approval`.
