# PIR Plan: Codev Dev surface — bottom-panel tab + always-visible status-bar chip

> **Status: design-of-record, HELD pending #812.** Per architect decision at the
> `plan-approval` gate, #921 stays whole (the panel tab lives in #812's shared
> `codevPanel` container) and implementation does **not** begin until #812
> ("introduce a Codev panel tab / bottom-area view container") ships. This plan
> is the approved design the implement phase will execute once that dependency
> clears. #812 has been raised to the architect for scheduling so this work can
> unblock rather than wait passively.

## Understanding

`afx dev` runs a **single** dev PTY (one slot across `{main + all builders}` —
they all bind main's ports, so only one can run at a time). Today that PTY is
surfaced only as a generic VSCode terminal tab named `Codev: <name> (dev)`
(`terminal-manager.ts` → `openDevTerminal`, a `CodevPseudoterminal` over a Tower
WebSocket, placed in `TerminalLocation.Panel`). It is visually indistinguishable
from any other terminal, so a reviewer — typically someone running
`afx dev <builder>` to exercise a builder's running worktree at PIR's
`dev-approval` gate — cannot tell at a glance:

- **Is a dev running at all?**
- **Which target is it?** (`main` vs `pir-809` — easy to lose across worktrees.)
- **How do I stop / restart it fast** without hunting the terminal dropdown or
  opening the Workspace sidebar view (which costs sidebar real-estate each time)?

The Workspace view's Start/Stop Dev row partially addresses this, but only when
the sidebar is on that view. The need is **ambient awareness + fast control of
the single dev server** — surfaced where it's always visible and quick to act on.

### The use case is awareness + control, NOT terminal fidelity

This framing (confirmed with the architect) is load-bearing for the design. The
user does not need ANSI-faithful scrollback, search, or copy in a *new* surface —
the existing native terminal tab already does that well and **stays**. The new
surfaces exist to answer "is it running / which target / stop-restart" at a
glance. That rules out the heavy "re-implement a terminal in a webview (xterm.js
+ a second Tower WS subscription)" path: it adds failure surface and
re-implements terminal features for no user-need gain.

### Why this depends on #812 (editorial, not technical)

- The **status-bar chip** depends on nothing — it is a `createStatusBarItem`.
- The **panel tab** needs *a* bottom-panel `viewsContainer` to mount into. #812
  creates the shared `codevPanel` container (the same one #813 / #814 / #815
  migrate into). This PR *could* declare its own throwaway container instead, but
  that would create exactly the interim bottom-container proliferation #812 is
  meant to prevent. So the dependency is a **consolidation** choice: mount in the
  shared container rather than spawn a one-off. Per architect decision, #921
  stays whole and waits for `codevPanel` rather than shipping a partial or a
  throwaway container.

## Proposed Change

Two complementary surfaces, both driven off the existing dev-terminal lifecycle
(`TerminalManager.onDidChangeDevTerminals`, `listDevTerminals()`), with the
native terminal tab left intact as the output surface (COEXIST).

### Surface 1 — Codev Dev panel tab (`codev.devServer`)

A **`TreeDataProvider`** (not a webview) mounted in #812's `codevPanel`
container. TreeDataProvider is chosen deliberately: it matches every existing
Codev view (`status.ts`, `team.ts`, `recently-closed.ts`), needs no webview /
CSP / xterm machinery, and is the right weight for a status surface. Because the
use case is status + control (output stays in the native terminal), a tree of
status rows + title-bar actions fully covers it.

- **Tab title**: `Codev Dev`.
- **Rows (status header)** while running:
  - `Target: <name>` (`main` or `pir-XXX`, via the dev terminal's `builderId` →
    friendly name; reuse `resolveWorkspaceDevTarget` naming).
  - `Running for <uptime>` (e.g. `4m 32s`) — refreshed every second by a timer
    that fires `onDidChangeTreeData` while a dev is running, disposed on stop.
  - `Port: <n>` — **best-effort**: derive from `worktree.devUrls` / `devCommand`
    config if present; **omit the row entirely if undetectable** (no guessing).
- **Idle / stopped states** (design call #1 + lifecycle):
  - Never-run / idle → the view contributes a single placeholder row
    (`No dev running — start via afx dev <target> or the Workspace view`). The
    tab is present-but-empty rather than vanishing, so the container tab strip is
    stable. (The chip remains the always-visible "is it running" signal.)
  - After a dev stops → an epitaph row `Stopped — last target <name>, ran <Xs>`
    until the user dismisses it or starts another dev. The actual log remains in
    the native terminal, so we do not try to preserve output here.
- **Tab badge**: a small activity dot on the `Codev Dev` tab when a dev is
  running and the user is focused on another `codevPanel` tab (VSCode
  `TreeView.badge`).
- **Title-bar actions** (`view/title`, `group: navigation`, guarded by a
  `codev.devServerRunning` context key where action requires a live dev):
  - `Stop Dev Server` (`$(debug-stop)`) → `codev.devServer.stop`.
  - `Restart Dev Server` (`$(debug-restart)`) → `codev.devServer.restart`
    (stop current target, then start the same target).
  - `Switch Target` (`$(arrow-swap)`) → `codev.devServer.switchTarget`: Quick
    Pick of `main` + builders; reuses the single-slot swap semantics of
    `startDevForTarget`. **Always shown** (design call #5 — consistent placement).
  - `Reveal in Workspace View` (`$(eye)`) → `codev.devServer.revealInWorkspace`:
    focus `codev.workspace` and its Dev Server row.

### Surface 2 — status-bar chip

- A **second, independent** `StatusBarItem` (`StatusBarAlignment.Left`,
  priority **99** — left of the existing connection/builder-count item at 100).
- **Visibility**: created when a dev starts, disposed when it stops (driven by
  `onDidChangeDevTerminals`).
- **Text**: `$(zap) Dev: <target>` (e.g. `$(zap) Dev: pir-809`).
- **Background**: `new vscode.ThemeColor('statusBarItem.prominentBackground')`
  (design call #4 — canonical; theme-safe, no hand-coded color).
- **Tooltip**: `Codev dev server running for <target> · Click to focus Codev Dev panel`.
- **Click**: `codev.devServer.focus` — reveal the `Codev Dev` tab (open the panel
  if closed, switch to the tab if on another). Thin breadcrumb; no Quick Pick
  layer between chip and tab.

### Shared lifecycle plumbing

- A small client-side map `builderId → startedAt` populated when `openDevTerminal`
  fires and cleared on `closeDevTerminal`, so uptime and the epitaph "ran Xs" have
  a start time (`listDevTerminals()` currently carries only `{builderId, terminalId}`).
- Both surfaces subscribe to the **single** `onDidChangeDevTerminals` event and
  re-derive state from `listDevTerminals()` (single source of truth). Target
  swaps (stop A → start B) update both surfaces in lockstep because both reads
  go through the same event + list.

### Resolved design calls (from the issue)

| # | Question | Decision |
|---|----------|----------|
| 1 | Tab when no dev running | Present-but-placeholder (stable tab strip; chip is the always-visible signal). Post-stop shows an epitaph row. |
| 2 | PTY output rendering | **No output rendering in-tab.** Status-header tree only; output stays in the native terminal. Justified by the use case (awareness/control, not fidelity). Plain-log tail is a possible future enhancement, explicitly out of scope here. |
| 3 | Replace vs coexist with native terminal | **Coexist.** Native `Codev: <name> (dev)` terminal stays as the output surface; safest for muscle memory and avoids re-plumbing. |
| 4 | Chip background | `prominentBackground`. |
| 5 | `Switch Target` visibility | Always shown. |

## Files to Change

> All under `packages/vscode/`. Executed in the implement phase **after #812 lands**
> (so `codevPanel` exists in `package.json`'s `viewsContainers.panel`).

- `packages/vscode/src/views/dev-server.ts` — **new.** `DevServerTreeProvider`
  implementing `TreeDataProvider<vscode.TreeItem>`: renders the status header /
  placeholder / epitaph rows, owns the 1s uptime refresh timer, exposes
  `onDidChangeTreeData`. Subscribes to `terminalManager.onDidChangeDevTerminals`.
- `packages/vscode/src/views/dev-server-format.ts` — **new (pure helpers).**
  `formatUptime(ms)`, target-name derivation, port-from-config extraction. Pure
  and unit-tested (vitest, `src/__tests__/`).
- `packages/vscode/src/commands/dev-server-actions.ts` — **new.** Thin command
  handlers `stop` / `restart` / `switchTarget` / `revealInWorkspace` / `focus`,
  delegating to existing `dev-shared.ts` (`startDevForTarget`, `stopDevForTarget`)
  and `terminalManager`.
- `packages/vscode/src/terminal-manager.ts` — add the `builderId → startedAt`
  map (set in `openDevTerminal` ~`:220`, cleared in `closeDevTerminal` ~`:244`)
  and a getter so the view/chip can read start times. No change to existing
  terminal behavior.
- `packages/vscode/src/extension.ts` — create/dispose the chip `StatusBarItem`
  (driven by `onDidChangeDevTerminals`), register `codev.devServer.*` commands
  (`regCli` guard), register the `codev.devServer` tree view, maintain the
  `codev.devServerRunning` context key.
- `packages/vscode/package.json`:
  - add `codev.devServer` view inside the `codevPanel` `viewsContainer` (created
    by #812) under `contributes.views`;
  - add the five `codev.devServer.*` command declarations (titles + icons);
  - add the four `view/title` menu entries (`when: view == codev.devServer`,
    `group: navigation`, plus `codev.devServerRunning` gating where needed).

## Risks & Alternatives Considered

- **Risk — #812 not yet merged (the reason for the hold).** Mounting into a
  non-existent `codevPanel` container fails. Mitigation: implementation gated on
  #812; #812 raised for scheduling. *No code lands until `codevPanel` exists.*
- **Risk — port is often undetectable.** `listDevTerminals()` carries no port and
  there's no stdout parsing today. Mitigation: best-effort from config only; omit
  the row when unknown rather than guess. Acceptance is written as "port if known".
- **Risk — uptime needs a start timestamp not currently tracked.** Mitigation: the
  small `startedAt` map in `TerminalManager`; if a dev predates extension
  activation (reconnect), show `Running` without a duration rather than a wrong one.
- **Risk — two surfaces drift out of sync on swaps.** Mitigation: both derive from
  the single `onDidChangeDevTerminals` + `listDevTerminals()`; no independent state.
- **Risk — regressing the Workspace view's dev row.** Mitigation: this PR only
  *adds* surfaces and reads the same `listDevTerminals()`; no change to
  `workspace.ts`'s row logic. Covered by the test plan.
- **Alternative — xterm.js webview + replace native terminal (design call #2/#3
  heavy path).** Rejected: re-implements terminal features for no use-case gain,
  adds a second WS subscription and CSP/webview surface. The native terminal
  already serves output.
- **Alternative — ship chip + commands now, defer only the tab (avoid the hold).**
  Technically viable (chip has no #812 dependency) and was proposed; architect
  chose to keep #921 whole and hold for consolidation. Recorded here as the
  considered-and-rejected option.
- **Alternative — standalone throwaway container now, re-home into `codevPanel`
  later.** Rejected: creates the interim container proliferation #812 exists to
  prevent.

## Test Plan

> Reviewer exercises this at the `dev-approval` gate **once implementation
> proceeds** (post-#812). Until then this plan is held and no running build exists.

- **Unit (vitest, `src/__tests__/dev-server-format.test.ts`)**: `formatUptime`
  (seconds, minutes, `4m 32s`, hour rollover, 0s edge), target-name derivation
  (`main` vs `pir-XXX`), port extraction (present in config → value; absent →
  `null`/omit).
- **Manual — chip**: start `afx dev main` and `afx dev <builder>`; chip appears
  bottom-left as `$(zap) Dev: <target>` with prominent tint; tooltip correct;
  click focuses the Codev Dev tab (opening the panel if closed). Stop → chip
  disappears.
- **Manual — tab**: status header shows correct target, live-ticking uptime, and
  port when derivable (omitted otherwise); title-bar Stop / Restart / Switch
  Target / Reveal-in-Workspace each behave as labeled; activity-dot badge shows
  when running and focused on another `codevPanel` tab; post-stop epitaph row.
- **Manual — swap lockstep**: with `pir-809` dev running, Switch Target → `main`;
  both chip and tab update to `main` together; the single-slot swap prompt fires
  as today.
- **Manual — Workspace view parity**: confirm the existing Start/Stop Dev row
  reflects the same state; no regression.
- **Themes**: verify chip + tab render cleanly in Dark, Light, and High-Contrast
  (ThemeColor / theme CSS vars only — no hand-coded colors).

## Dependency & Sequencing (summary)

1. **Blocked on #812** (`codevPanel` container) — raised to architect for
   scheduling.
2. This plan is approved as design-of-record and **held** at/after
   `plan-approval`. The implement phase begins only once #812 has merged and
   `codevPanel` exists in `packages/vscode/package.json`.
3. No sibling dependency on #813 / #814 / #815 — independent tabs in the same
   container; any order after #812.
