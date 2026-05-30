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

### Plan revised (v2) — follow #810 pattern

Architect pushed back: the icon-swap approach hides newness on assigned rows,
defeating the main purpose (engineer spotting NEW issues assigned to them).
Considered a "Recent" top group (rejected — out-of-scope structural re-sort per
the issue body). Settled on following #810's design language: a monochrome
`[new]` **text prefix after the issue number** (`#911 [new] <title>`),
analogous to #810's `[phase]` prefix. Coexists with the account/issues icon —
icons untouched. Survives truncation (leading position). Pure helper
`recencyPrefix(createdAt, now)` + `relativeAge` for tooltip, vitest-tested,
mirroring #810's extracted-testable-helper-with-fallback pattern.

Plan rewritten, awaiting `plan-approval`.
