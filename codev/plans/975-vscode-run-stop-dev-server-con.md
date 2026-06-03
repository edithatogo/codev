# PIR Plan: Gate builder-row Run/Stop Dev Server menu on `worktree.devCommand` presence

## Understanding

**The bug (issue #975).** Right-clicking a builder row in the Codev **Builders** tree always shows **Run Dev Server** / **Stop Dev Server** context-menu entries, even when `worktree.devCommand` is not configured. Picking either runs a command that has nothing to run — `dev-shared.ts:90-94` shows a "Configure worktree.devCommand…" error toast (or a no-op for stop). The right behavior is to **not offer the option** when there's no dev command.

**Why the divergence (root cause).** The two offending menu entries gate on view + viewItem family only:

- `packages/vscode/package.json:386-390` — `codev.runWorktreeDev`, `when: "view == codev.builders && viewItem =~ /^(builder|blocked-builder|awaiting-builder)-/"`
- `packages/vscode/package.json:391-394` — `codev.stopWorktreeDev`, same `when`

The Workspace view's equivalent rows work correctly because they gate on `viewItem == workspace-dev-start` / `workspace-dev-stop`, and those `viewItem` values are **only emitted when a dev command is configured** (`workspace.ts:185` — the `else if (devCommand !== null)` branch). The menu inherits the config gate transitively through the row's existence. The builder-row `viewItem` (`builder-<protocol>`, `blocked-builder-…`, `awaiting-builder-…`) is unrelated to dev-command presence, so there's nothing to inherit — hence the always-on menu.

**The fix shape.** Add a `codev.hasDevCommand` setContext key, kept live via the same `worktree-config-updated` SSE event the Workspace view already consumes, and add `&& codev.hasDevCommand` to the two builder-row `when` clauses. Six design calls (issue's "Design questions") inform the *exact* shape; decisions below.

## Design decisions (the plan-approval calls)

These mirror the issue's six questions. **Recommendations are marked ✅; reviewer can redirect any of them by editing this file before approving.**

1. **Where is the context key set?** ✅ **Subscribe to the live config-change signal, not activation-only.** Reuse the exact pair `WorkspaceProvider` uses (`workspace.ts:22-53`): `connectionManager.onStateChange` (seed/refresh on connect) + `connectionManager.onSSEEvent` filtered to `envelope.type === 'worktree-config-updated'` (Tower's server-side `worktree-config-watcher.ts` fires this whenever `.codev/config(.local).json` changes). This preserves v3.1.1's live-refresh behavior — acceptance criterion #5. Activation-only would go stale on config edits.

2. **Shared vs layered config.** ✅ **Layered.** Resolve via the existing `loadWorktreeConfig(connectionManager)` (`load-worktree-config.ts`), which returns Tower's canonical 5-layer deep-merge (defaults / cache / global / project / project-local) — exactly what the Workspace view and `dev-shared.ts` already use. No new resolver, no client-side `.codev/config.json` parsing. Per-engineer `.codev/config.local.json` dev commands are honored for free.

3. **Per-worktree overrides → single global key vs per-row metadata.** ✅ **Single global `codev.hasDevCommand` key.** Rationale: `.codev/config.json` is *always symlinked* into each builder worktree (the worktree-block invariant in CLAUDE.md — root `.codev/config.json` is symlinked regardless of the `symlinks` list), so the resolved `devCommand` is identical across every builder row and the active workspace. `afx dev <id>` itself resolves the same shared config. A single key reflecting the active workspace's resolved config is therefore the truth for all rows. If genuine *per-worktree* dev commands are ever supported, this would need per-row `viewItem` metadata (`builder-with-dev-…` vs `builder-no-dev-…`) — noted as **future work, not built now**. Keeping it global also keeps it consistent with the Workspace view, which is itself single-target scoped.

4. **Keybindings (`ctrl+alt+r` / `cmd+alt+r`, `ctrl+alt+s` / `cmd+alt+s` → `runWorkspaceDev` / `stopWorkspaceDev`, `package.json:558-567`).** ✅ **Gate them with `codev.hasDevCommand`** for consistency with the principle "don't offer what won't work." The keystroke becomes silent (no-op) when no dev command is configured. `dev-shared.ts`'s error toast remains as defense-in-depth for the brief window where the context key may be momentarily stale. *Alternative (rejected, but reviewer may prefer):* leave keybindings ungated so the keystroke still surfaces the helpful "Configure worktree.devCommand…" toast — trades consistency for explicit feedback.

5. **Command palette (the `Codev: Run/Stop …Dev…` entries).** ✅ **Gate the two workspace-level dev commands** (`runWorkspaceDev`, `stopWorkspaceDev`) in `contributes.menus.commandPalette` with `when: "codev.hasDevCommand"` — palette shouldn't surface commands that can't run. The two **builder-row** commands (`runWorktreeDev`, `stopWorktreeDev`) require a tree-row argument and do the wrong thing when invoked argless from the palette (same situation as `viewSpecFile`/`viewPlanFile`/`viewReviewFile`, which are pinned `when: "false"`). ✅ **Pin those two `when: "false"`** — a one-line correctness win that also moots the config question for them. (`openDevUrl` palette visibility is a sibling concern — see Out of Scope.)

6. **What "presence" means — empty string.** ✅ **Treat `""`/whitespace-only as absent.** The truth we want is "is there a *runnable* dev command," which matches `dev-shared.ts:91`'s actual gate (`if (!devCommand)` — empty string is falsy → error). Define `hasRunnableDevCommand(config) = typeof config?.devCommand === 'string' && config.devCommand.trim().length > 0`. **Latent inconsistency found:** `workspace.ts:185` currently uses `devCommand !== null`, which would show the Start row for `"devCommand": ""` even though clicking it errors. ✅ **Extract the shared `hasRunnableDevCommand` helper and use it in both the new context key and `workspace.ts:185`**, fixing the empty-string footgun in one place and keeping the two surfaces provably consistent. (`ResolvedWorktreeConfig.devCommand` is typed `string | null` — `packages/types/src/api.ts:305` — so `""` is reachable.)

## Proposed Change

1. **New shared helper** in `load-worktree-config.ts`: `hasRunnableDevCommand(config: ResolvedWorktreeConfig | null): boolean`. Co-located with the config loader (the workspace-wide config concern already lives there).

2. **Context-key wiring** in `extension.ts`: a single named async function `syncHasDevCommandContext()` that fetches the merged config and calls `setContext('codev.hasDevCommand', hasRunnableDevCommand(config))`. Seed it once after the connection block, and re-invoke from one consolidated subscription handling `onStateChange` + the `worktree-config-updated` SSE envelope (one subscription, named function — not duplicated inline closures). Mirrors the existing `syncTerminalFocusContext` pattern (`extension.ts:164-171`).

3. **`workspace.ts:185`**: replace `else if (devCommand !== null)` with `else if (hasRunnableDevCommand(worktreeConfig))` (consistency + empty-string fix). No other workspace-view change.

4. **`package.json` manifest**:
   - Append `&& codev.hasDevCommand` to the two builder-row `when` clauses (`runWorktreeDev` line 388, `stopWorktreeDev` line 393).
   - Add `commandPalette` entries: `runWorkspaceDev`/`stopWorkspaceDev` with `when: "codev.hasDevCommand"`; `runWorktreeDev`/`stopWorktreeDev` with `when: "false"`.
   - Add `&& codev.hasDevCommand` (or `when: "codev.hasDevCommand"`) to the four keybindings at `package.json:558-567` — wait: only `runWorkspaceDev`/`stopWorkspaceDev` have keybindings (two entries). Gate both.

5. **Tests** — extend `packages/vscode/src/__tests__/menu-when-clauses.test.ts` (or a sibling spec):
   - Assert the two builder-row dev `when` clauses contain `codev.hasDevCommand`.
   - Assert `runWorkspaceDev`/`stopWorkspaceDev` keybindings carry the `codev.hasDevCommand` guard.
   - Assert palette gating (workspace dev → `codev.hasDevCommand`; worktree dev → `false`).
   - Unit-test `hasRunnableDevCommand`: `null` → false, `{devCommand: null}` → false, `{devCommand: ""}` → false, `{devCommand: "  "}` → false, `{devCommand: "pnpm dev"}` → true.

## Files to Change

- `packages/vscode/src/load-worktree-config.ts` — add `hasRunnableDevCommand()` helper (+ export).
- `packages/vscode/src/extension.ts` — add `syncHasDevCommandContext()`, seed + wire to `onStateChange` and the `worktree-config-updated` SSE envelope.
- `packages/vscode/src/views/workspace.ts:185` — use `hasRunnableDevCommand(worktreeConfig)` instead of `devCommand !== null`.
- `packages/vscode/package.json`
  - `:388`, `:393` — append `&& codev.hasDevCommand` to the two builder-row `when` clauses.
  - `contributes.menus.commandPalette` (~`:267-326`) — add 4 entries (2 × `codev.hasDevCommand`, 2 × `false`).
  - `:558-567` — gate the two dev keybindings with `codev.hasDevCommand`.
- `packages/vscode/src/__tests__/menu-when-clauses.test.ts` — extend (or add `dev-command-gating.test.ts`).

## Risks & Alternatives Considered

- **Risk: context key stale right after connect** (key not yet set before first tree render). Mitigation: seed `syncHasDevCommandContext()` immediately in the connection-established path and on every `onStateChange` to `connected`; `dev-shared.ts`'s toast covers any residual race. Worst case before seed: a builder row briefly omits the entries — fail-safe direction (hide, not falsely show).
- **Risk: SSE envelope shape drift.** The `worktree-config-updated` filter copies `WorkspaceProvider`'s exact guard (`JSON.parse(data).type === 'worktree-config-updated'`); if Tower's envelope changes, both break together — acceptable, single source of truth.
- **Alternative (rejected): per-row `viewItem` metadata** (`builder-with-dev-…`). Rejected — `.codev/config.json` symlink invariant makes per-row dev commands non-divergent today; adds regex/contextValue complexity for no current payoff. Documented as future work.
- **Alternative (rejected): activation-only context key.** Rejected — breaks the v3.1.1 live-refresh contract (acceptance #5).
- **Alternative (rejected): client-side `.codev/config.json` parse.** Rejected — misses `.codev/config.local.json` layering; `loadWorktreeConfig` already does the correct merge.

## Test Plan

**Unit (vitest, `pnpm --filter @cluesmith/codev-vscode test` or the vscode package's runner):**
- `hasRunnableDevCommand` truth table (null / null-cmd / "" / whitespace / real).
- `menu-when-clauses.test.ts`: the two builder-row dev entries' `when` contains `codev.hasDevCommand`; workspace-dev entries unchanged; keybinding + palette gating as decided.

**Manual at `dev-approval` (run the worktree, this is PIR's killer move):**
1. With `worktree.devCommand` **unset** in `.codev/config.json` → right-click a builder row → **no** Run/Stop Dev Server entries. ✔ acceptance #1.
2. Add `"devCommand": "pnpm dev"` and **save** (no window reload) → entries appear on the builder row within a beat (live SSE refresh). ✔ acceptance #2, #5.
3. Remove it again, save → entries disappear live. ✔ acceptance #5.
4. Set `"devCommand": ""` → entries stay hidden (empty = absent). ✔ Q6.
5. Workspace view Start/Stop rows behave exactly as before across the same edits. ✔ acceptance #3.
6. Keybinding `cmd+alt+r` with no dev command → silent no-op (or toast, per Q4 decision); with a dev command → starts dev. ✔ acceptance #4.
7. Build: `pnpm build` clean; existing vscode tests green.

## Out of Scope (per issue + sibling-audit note)

- Reshaping `worktree.devCommand` or its contents.
- Dashboard's equivalent dev-command surfacing.
- **`worktree.devUrls` "Open Dev URL" rows** — `codev.openDevUrl` is referenced only by the Workspace view (`workspace.ts:217`); it has **no builder-row context-menu entry**, so the issue's symptom doesn't apply there. Its palette entry (`package.json:202`) is visible regardless of config — same gating *principle*, different (and lower-priority) surface. Flagged for a sibling issue, not fixed here, to keep this change bounded.
