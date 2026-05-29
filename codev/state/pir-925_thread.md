# pir-925 thread — vscode builder Quick Pick: show issue # + title

## Plan phase

Investigated the two outlier pickers. **Key finding: the issue's literal fix does not compile.**

- The issue claims both outliers read `getWorkspaceState`, "the same endpoint the seven correct pickers use." Wrong on two counts:
  - The **seven correct pickers all use `client.getOverview`** → `OverviewBuilder` (has `issueId`/`issueTitle`/`phase`).
  - The **two outliers use `client.getWorkspaceState`** → `Builder` (`api.ts:25-46`), which has **no `issueId`/`issueTitle`**. `b.issueId` there is a TS error.
- The outliers also depend on `Builder.terminalId` + `Builder.id` (not on `OverviewBuilder`), so they can't just swap wholesale to `getOverview`.
- Precedent for "picker needs both": `run-worktree-dev.ts:29,53` — `getOverview` primary + `resolveAgentName(overviewId, workspaceBuilders)` join (ids differ in shape; tail-match, not `===`).

**Approach**: extract a pure `buildBuilderPickRows(overviewBuilders, workspaceBuilders)` helper (mirrors the `prune-builder-terminals.ts` pure-helper precedent), used by both call sites. `getOverview` for the label, joined to `getWorkspaceState` for `terminalId`/canonical `id`/`name`. Action path fed from the workspace `Builder` exactly as today (zero downstream change). Terminal tab title preserved as `Codev: <name>`.

Plan written to `codev/plans/925-vscode-open-builder-terminal-a.md`. Awaiting `plan-approval`.
