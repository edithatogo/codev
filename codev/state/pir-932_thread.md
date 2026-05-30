# PIR #932 — vscode: move Pull Requests below Backlog in sidebar

## Plan phase (2026-05-30)

Issue is a one-line array reorder in `packages/vscode/package.json`. Confirmed the
views block lives at `package.json:541-547`; `codev.pullRequests` (543) sits above
`codev.backlog` (544). The swap moves Backlog above Pull Requests so the triage
flow (Builders → Backlog) reads adjacently.

Verified there's no programmatic view-ordering layer — views are contributed
declaratively, so array position is the source of the default order. VSCode persists
user-reordered views per-workspace, so customized users are unaffected.

Plan written to `codev/plans/932-vscode-move-pull-requests-sect.md`. Awaiting
plan-approval gate.

## Implement phase (2026-05-30)

plan-approval approved. Applied the swap at `packages/vscode/package.json:543-544`
(Backlog now precedes Pull Requests). +1/-1, JSON validates. Committed a42cf5d2.

**Environment snag (not caused by this change):** the worktree shipped without an
installed `node_modules` — porch's `build` check (`npm run build` → `tsc`) failed
with `sh: tsc: command not found`. A one-line JSON reorder can't cause that.
`pnpm install --frozen-lockfile` was rejected ("not compatible lockfile"); the
committed lockfile is identical to main, so this is a worktree/pnpm env quirk, not
branch drift. Installed via `pnpm install --no-frozen-lockfile` (exit 0, 1247 pkgs),
then `git restore pnpm-lock.yaml` so the PR stays scoped to package.json only.
Re-ran porch checks: build ✓ (47s), tests ✓ (28s). Now at dev-approval gate.
