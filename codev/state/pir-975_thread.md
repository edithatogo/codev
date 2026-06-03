# PIR #975 — gate builder-row Run/Stop Dev Server on `worktree.devCommand`

## Plan phase (iteration 1)

Investigated the surface. Root cause confirmed: builder-row dev menu entries
(`package.json:386-394`) gate on view+viewItem family only, no config gate. The
Workspace view rows work because their `viewItem` (`workspace-dev-start/stop`) is
only emitted when `devCommand` is set (`workspace.ts:185`).

Key findings driving the plan:
- Config resolves via `loadWorktreeConfig()` → Tower's 5-layer merge (already
  shared+local layered). Reuse it; no new resolver.
- Live-refresh precedent: `WorkspaceProvider` re-renders on the
  `worktree-config-updated` SSE envelope (`workspace.ts:43-53`). Mirror that for
  the context key → satisfies acceptance #5 (no reload).
- `.codev/config.json` is always symlinked into worktrees ⇒ devCommand identical
  across builder rows ⇒ a single global `codev.hasDevCommand` key is the truth.
  Per-row metadata = future work only.
- Latent bug: `workspace.ts:185` uses `devCommand !== null`, so `"devCommand": ""`
  would show a Start row that errors on click. dev-shared.ts uses `!devCommand`.
  Resolving with a shared `hasRunnableDevCommand` (trim non-empty) helper used by
  both surfaces.

Decisions (issue's 6 design Qs): live SSE-driven key; layered config; single
global key; gate keybindings + palette too; empty-string = absent. All laid out
in the plan for the reviewer to redirect at the gate.

Plan written to `codev/plans/975-vscode-run-stop-dev-server-con.md`. Awaiting
plan-approval.
