# Specification: Multi-Architect Feature — Lifecycle, Persistence, and UX

## Metadata
- **ID**: spec-2026-05-20-786-multi-architect-feature
- **Status**: draft (iter-3 — architect decisions applied, ready for iter-2 CMAP)
- **Created**: 2026-05-20
- **GitHub Issue**: [#786](https://github.com/cluesmith/codev/issues/786)
- **Predecessors**: #755 (v3.0.5 primitive), #761 (v3.0.6 dashboard tabs), #774 (v3.0.8 routing fix)

## Clarifying Questions Asked
Issue #786 is itself the result of clarifying work the architect did after Shannon's external adoption exposed gaps. No additional clarification was sought before drafting.

After the first CMAP round, all three reviewers (Gemini, Codex, Claude) converged on the same finding: the issue body's diagnoses of gaps #2 and #3 don't match current code. The revised spec below reflects the actual baseline after verification against `packages/codev/src/agent-farm/servers/tower-instances.ts`, `tower-terminals.ts`, `tower-utils.ts`, `state.ts`, `utils/architect-name.ts`, and `packages/dashboard/src/hooks/useTabs.ts`.

## Problem Statement

The multi-architect feature lets a workspace host more than one "architect" terminal — the headline use case is letting a second architect (e.g. `ob-refine`) drive a focused workflow without monopolising the primary `main` architect. The primitive shipped in v3.0.5 (#755), dashboard tab rendering in v3.0.6 (#761), and a critical routing fix in v3.0.8 (#774).

But the feature is not yet a coherent product. The pieces that exist work in isolation; trying to actually *drive* the feature exposes gaps that an end user encounters in their first ten minutes:

- They can add a sibling architect, but they cannot remove one — short of killing the entire workspace.
- Their sibling architect survives a Tower *crash* but vanishes on `afx workspace stop` and on `afx tower stop`, because the graceful-shutdown path deletes its row and the `workspace start` path only re-creates `main`.
- The dashboard tab strip surfaces sibling architects but offers no close affordance on the tab itself.
- CLI surfaces (`afx status`) and the VSCode extension sidebar deliberately collapse all architects into a single "Architect" entry — the v1 contract is still in force at `tower-terminals.ts:928-940`.
- The headline value proposition — "messages routed to the right architect" — only started working end-to-end in v3.0.8, because no one had ever exercised the round-trip before shipping.
- Identity preservation on shellper auto-restart is incomplete: when a sibling's `claude` process crashes and shellper auto-restarts it, the new process is spawned without `CODEV_ARCHITECT_NAME` re-injection, so builders spawned afterward lose affinity to that sibling.

Result: an external adopter (Shannon) running the feature in production with recurring workarounds.

## Current State

### What works today (verified)

| Capability | Code path | Status |
|---|---|---|
| `afx workspace add-architect <name>` CLI | `packages/codev/src/agent-farm/commands/workspace-add-architect.ts` | Functional |
| Name validation (`^[a-z][a-z0-9-]*$`, ≤64 chars) | `packages/codev/src/agent-farm/utils/architect-name.ts:24-35` | Functional |
| Auto-numbering (`architect-2`, `-3`, fills gaps) | `utils/architect-name.ts:51-65` | Functional |
| Tower in-memory map of architects | `servers/tower-instances.ts` (`WorkspaceTerminals.architects: Map<string,string>`) | Functional |
| `setArchitectByName(name, ...)` writes sibling rows to `state.db` on add | `state.ts:93`, called from `tower-instances.ts:767`, `:816` | Functional |
| `saveTerminalSession` writes sibling rows to global `terminal_sessions` table on add | `tower-terminals.ts:185`, called from `tower-instances.ts:759`, `:813` | Functional |
| Builder→architect routing with `spawningArchitect` affinity | `servers/tower-messages.ts:320-342` | Functional (post-#774) |
| Dashboard renders one tab per architect | `packages/dashboard/src/components/ArchitectTabStrip.tsx`, `useTabs.ts:37-58` | Functional |
| Right-pane builder/shell tabs have a close button | `useTabs.ts:77` (builders), `:91` (shells); `TabBar.tsx:48-64` renders X when `closable:true` | Functional |
| `main` architect row written on `workspace start` via `setArchitect()` | `tower-instances.ts:431-446`, `:484-491` | Functional |
| Crash recovery: surviving shellper sessions are reconciled on Tower restart | `tower-terminals.ts:reconcileTerminalSessionsInner`, lines 485-672 (architects restored at line 650 via `role_id`) | Functional |
| `architect:<name>` deep-link / address grammar | `useTabs.ts:139-150`, `tower-messages.ts` | Functional |

### Confirmed gaps (post-CMAP)

| # | Gap | Evidence (verified) |
|---|---|---|
| 1 | **No `remove-architect` CLI or dashboard affordance.** Workarounds: kill terminal from sidebar (left pane only); restart Tower (nukes all workspaces) | No `remove-architect` file/command exists; `WorkspaceClient` has no `removeArchitect` method |
| 2 | **Architect tabs hardcode `closable: false` regardless of whether the architect is `main` or a sibling.** Right-pane tabs are already closable — this gap is architect-only | `useTabs.ts:52` — `closable: false` for all architect tabs |
| 3 | **Siblings don't survive graceful stop/start.** `stopInstance` calls `deleteWorkspaceTerminalSessions(resolvedPath)` deleting ALL rows for the workspace, and `launchInstance` only creates `main` (gated on `entry.architects.size === 0` and hardcoded `'main'` write) | `tower-instances.ts:608` (delete all), `:362-431` (only-main create). Note: crash recovery WORKS because rows aren't deleted on crash — only on graceful stop |
| 4 | **Identity loss on shellper auto-restart.** The reconciliation path's `restartOptions.env` doesn't inject `CODEV_ARCHITECT_NAME`, so when shellper auto-restarts a sibling's claude process (max-restart loop), the restarted process spawns with Tower's process env — builders spawned afterward lose affinity to that sibling | `tower-terminals.ts:559-567` builds `cleanEnv` from `process.env` only; `:773-776` same in workspace status path. Compare with `tower-instances.ts:728` where `addArchitect` correctly injects `CODEV_ARCHITECT_NAME: name` at first spawn |
| 5 | **v1 collapse logic in workspace-terminals API.** The API emits a single "Architect" terminal entry regardless of how many architects exist; the comment explicitly says "Multi-architect UI is deferred to issue #2" | `tower-terminals.ts:928-940`. This is the proximate cause of `afx status` and other API consumers seeing only one architect |
| 6 | **`afx status` doesn't enumerate siblings.** Reads `state.architect` scalar in fallback mode; Tower API path inherits gap #5 | `packages/codev/src/agent-farm/commands/status.ts:86-92` |
| 7 | **VSCode extension shows a single "Open Architect" entry** with no awareness of siblings | `packages/vscode/src/views/workspace.ts:56-64` |
| 8 | **`main` is rejected only by collision** with the running main architect, not by reserved-name check. If the in-memory map were ever empty when add-architect runs (e.g. race condition), `validateArchitectName('main')` returns `null` (valid) | `validateArchitectName` accepts `main`; collision check at `tower-instances.ts` add path |
| 9 | **Crash detection is implicit.** `tower-messages.ts:336` falls back to `main` when the spawning architect is gone, but a stale in-memory map entry (terminal_id pointing at a dead PID) is not actively detected; behaviour depends on whatever exit handler cleared the map | `tower-messages.ts:320-342`, `tower-instances.ts:454-458` exit-handler clear |
| 10 | **Architect-to-architect messaging unverified end-to-end.** The `architect:<name>` address grammar exists but no test exercises `main` → `architect:ob-refine` round-trip | No matching test under `__tests__/`; no documentation |
| 11 | **Routing was broken v3.0.5 → v3.0.7** because the headline value prop was never exercised end-to-end before shipping (fixed in #774). The verify phase MUST exercise this manually | [[feedback_e2e_headline_path]] |

### Out of scope (preserved from issue, treated as fixed)
- **Cross-workspace routing.** Architects in workspace A cannot address architects in workspace B. Deferred previously; stays deferred.
- **Renaming architects after add.** File as a separate ticket if wanted; not part of #786.
- **Generic right-pane close affordance redesign.** Right-pane tabs (builders, shells, files) already render close buttons via `closable: true` + `TabBar.tsx`. The issue body's claim that "right-pane terminals also lack a close button" doesn't match current code; this spec only adds the close button to architect tabs.

## Desired State

A user can add, manage, evict, and recover sibling architects with the same fluency they have with builders. Concretely:

1. **Lifecycle parity.** Adding *and removing* a sibling architect is a first-class CLI operation with a corresponding dashboard affordance. The `main` architect remains undeletable.
2. **Graceful-restart persistence.** Sibling architects survive `afx workspace stop` + `afx workspace start` (and `afx tower stop` + start) in addition to the existing crash recovery. The restored architect retains its name and identity (`CODEV_ARCHITECT_NAME` re-injected on every (re)spawn, including shellper auto-restart).
3. **UX parity on architect tabs.** Sibling architect tabs carry a discoverable close affordance. `main` does not.
4. **Surface parity.** `afx status` enumerates sibling architects with their PIDs and terminal IDs. The VSCode extension sidebar shows all architects. The v1 architect-collapse logic at `tower-terminals.ts:928-940` is removed.
5. **Documented semantics.** Naming rules (including a reserved-name check for `main`), the `architect:<name>` address grammar (including architect-to-architect messaging), and the crash-recovery behaviour are documented and tested.
6. **End-to-end verification.** The verify phase exercises the headline value prop manually: add a sibling, spawn a builder from it, send `afx send architect`, observe routing. Repeat for remove, crash, graceful-restart, and shellper-auto-restart paths.

## Stakeholders

- **Primary Users**: Codev users who run multiple architects in one workspace. Two known concrete users today: the codev project's own architect, and Shannon's external adopter setup (`main` + `ob-refine`).
- **Secondary Users**: Future external adopters who hit the feature when scaling a single-workspace workflow into focused architect roles.
- **Technical Team**: The codev maintainer (architect). The builder spawned for #786 implements; the architect reviews at spec-approval, plan-approval, and PR gates.
- **Business Owners**: The codev maintainer. v3.0.6 promoted multi-architect as a headline feature; coherence of that headline is reputationally important.

## Success Criteria

### Functional (MUST)
- [ ] `afx workspace remove-architect <name>` exists. Removes the named sibling from Tower's in-memory map, deletes the persisted row from `state.db.architect` AND from `terminal_sessions`, terminates the architect's terminal cleanly (no zombie shellper). Refuses to remove `main`. Refuses to remove a name that doesn't exist. **Does NOT refuse to remove an architect that has in-flight builders** — per OQ-A, those builders' subsequent `afx send architect` calls fall back to `main` via the existing routing chain.
- [ ] Sibling architect rows survive `afx workspace stop` + `afx workspace start`. Specifically: `stopInstance` no longer indiscriminately deletes ALL rows; siblings' rows persist across the stop/start boundary, and `launchInstance` re-spawns them with their recorded `cmd` and re-injected `CODEV_ARCHITECT_NAME`. `main`'s existing behaviour is unchanged.
- [ ] **Identity preservation across shellper auto-restart.** `tower-terminals.ts` reconciliation builds `restartOptions.env` with `CODEV_ARCHITECT_NAME: <name>` for every architect (where `<name>` comes from `dbSession.role_id`). When a sibling's claude process dies and shellper restarts it, the new process spawns with the correct architect name in env.
- [ ] Sibling-architect tabs in the dashboard's `ArchitectTabStrip` carry a close affordance that triggers `remove-architect`. `main`'s tab has no close button.
- [ ] `afx status` enumerates ALL registered architects, showing name, PID, port (if any), and terminal ID. The v1 collapse logic at `tower-terminals.ts:928-940` is replaced with per-architect emission.
- [ ] VSCode extension Workspace sidebar exposes an expandable "Architects" tree section containing one entry per architect (per OQ-D). The section is present at N=1 (showing just `main`) and expands to show siblings when added.
- [ ] `validateArchitectName` rejects the reserved name `main` in addition to its existing checks. (Today `main` is accepted by the regex and rejected only by collision.)
- [ ] `architect:<name>` address grammar resolves correctly when used from another architect — confirmed by integration test that exercises `main` → `architect:ob-refine` and the reverse, both delivering to the correct PTY.

### Functional (SHOULD)
- [ ] When a sibling architect's terminal crashes permanently (max restarts exceeded), the existing exit-handler clear at `tower-instances.ts:454-458` runs AND **the persisted row is auto-deleted from `state.db.architect` and `terminal_sessions`** (per OQ-B). Subsequent `afx send architect` from its builder falls back to `main` per `tower-messages.ts:336`. Regression test asserts both the row deletion and the fallback behaviour.
- [ ] Dashboard tab labelling is consistent: `main`'s tab shows "main" (per `useTabs.ts:47` default and Spec 761's first-architect-id-is-bare design) even when siblings exist.
- [ ] **Dashboard active-tab state survives sibling removal cleanly.** If the active tab was the removed sibling, the active tab switches to `main`. If `main` was already active, it stays active. `useTabs` does not leave `activeTabId` pointing at a removed name.

### Functional (COULD)
- [ ] `remove-architect` interaction with auto-numbering: removing `architect-3` leaves the slot "gap-filled" by the next add per `autoNumberArchitectName`'s existing semantics. No renumbering of existing architects.

### Non-Functional
- [ ] No reduction in test coverage on touched files. New code adds unit tests for the reserved-name `main` rejection, `remove-architect` flow, persistence-across-stop/start, identity-on-restart env injection; integration tests for architect-to-architect messaging and crash/permanent-exit fallback.
- [ ] Persistence operations (write on add, delete on remove, read on restart) complete in <100ms per architect.
- [ ] Tower restart re-spawn for N sibling architects completes in <2s for N ≤ 8.
- [ ] The verify phase manually exercises the headline round-trip (add → builder spawn → `afx send architect` → land on sibling) on a real workspace, not just in tests. This is the explicit lesson from #774 / [[feedback_e2e_headline_path]].

## Constraints

### Technical Constraints
- **`architect` table schema (v9) is correct for siblings.** No migration needed; only the persistence-across-graceful-stop story needs to change.
- **The reconciliation path is the right extension point.** `reconcileTerminalSessionsInner` (`tower-terminals.ts:485+`) already restores architects from `terminal_sessions` rows when shellpers survive. The fix is to (a) preserve sibling rows across graceful stop, (b) inject `CODEV_ARCHITECT_NAME` in the restart env, and (c) trigger reconciliation (or an equivalent re-spawn) on `launchInstance` instead of only-create-main.
- **Tower restart re-spawn must NOT mirror builder rebind exactly** (per Claude's review — builders and architects already share `reconcileTerminalSessions()`). The constraint is to extend the existing reconciliation path, not invent a parallel mechanism.
- **Single-workspace assumption holds.** Cross-workspace architect routing remains out of scope.
- **`architect:<name>` address grammar is load-bearing.** Names with `:` are already rejected by the regex; preserve that.

### Business Constraints
- The next coherent release should ship this. v3.0.9 (publishing the #774 fix) is not blocked by #786; #786 should be the headline of the release that follows.
- No time estimates per SPIR convention.

### Out of Scope (from issue, treat as fixed)
- Cross-workspace routing.
- Architect renaming.
- Right-pane tab close redesign (already works; not a gap).

## Assumptions
- Shannon's `ob-refine` workflow is representative of how external adopters use sibling architects (one or two siblings, named by role, long-lived).
- The `main` architect remains structurally distinct: workspace-defining, undeletable, no close button. This distinction is desirable.
- The `cmd` recorded in `terminal_sessions` (or fetched from `state.db.architect`) is sufficient to re-spawn a sibling with the same shell harness. (Validate during plan phase by reading the column's current contents and the reconciliation code's command-reconstruction path.)
- Existing crash recovery (shellper-survives-Tower-crash) is correct and stays correct under this spec's changes.

## Solution Approaches

### Approach 1: Graceful-restart persistence + remove-architect + UX/surface parity (RECOMMENDED)
**Description**: Build out `remove-architect`, fix the graceful-stop row deletion, fix the identity-on-restart env injection, remove the v1 collapse logic, add the close affordance, and surface architects through `afx status` and VSCode. Treat this as one coherent feature pass.

**Pros**:
- Delivers the issue's stated goal ("the same fluency they have with builders") in one go.
- Closes all confirmed gaps together; each one composes (e.g., close affordance triggers `remove-architect`; `remove-architect` deletes the row that the graceful-restart path now reads).
- Identity-on-restart fix is small and well-scoped (a single env injection in the reconciliation path).

**Cons**:
- Larger PR surface area to test. Verify phase needs manual round-trips for multiple scenarios.
- Tab close affordance touches dashboard React/CSS — historically UI-sensitive (see [[feedback_ui_visual_verification]] — render in browser before approving).

**Estimated Complexity**: Medium
**Risk Level**: Medium — graceful-stop changes the lifecycle semantics for an existing path; identity-on-restart is a narrow change but in a load-bearing function; UI changes need visual verification.

### Approach 2: Persistence-only minimum, defer UX/lifecycle to follow-ups
**Description**: Ship graceful-restart persistence + identity-on-restart in one PR (gaps #3, #4). File separate tickets for remove-architect (#1), close affordance (#2), surface parity (#5/#6/#7), naming reserved-name (#8). Multiple small PRs.

**Pros**:
- Each PR is small and reviewable.
- Persistence + identity is the highest-leverage fix and lands first.

**Cons**:
- Loses the cohesive feature pass goal. Without `remove-architect`, persistence is incomplete (user can add but not retract).
- Recreates the v3.0.5 → v3.0.8 problem of shipping pieces that don't compose.

**Estimated Complexity**: Low per PR, Medium cumulative
**Risk Level**: Medium — cohesion risk.

### Approach 3: Document the gaps as known limitations and don't fix them
**Description**: Add a "known limitations" section to docs. No code changes.

**Pros**: Minimal effort.

**Cons**: Doesn't address the issue; external adopters keep hitting the gaps.

**Recommendation**: **Approach 1.** The issue scopes #786 as an umbrella SPIR exactly because the gaps interrelate. Splitting them re-creates the very problem the issue exists to fix.

## Architect Decisions (resolved 2026-05-20)

The architect resolved the four blocking open questions from iter-2 review. These are now decisions, not open questions, and bind the plan/implementation phases.

### Resolved (Critical)
- **OQ-A → REMOVE ANYWAY, fallback to main.** When `remove-architect <name>` runs against an architect with in-flight builders, remove the architect anyway. The builders' subsequent `afx send architect` calls fall back to `main` via the existing `tower-messages.ts:336` chain. *Rationale*: minimal new state, matches crash-recovery semantics.
- **OQ-B → AUTO-DELETE the persisted row on permanent exit.** When an architect's claude process exits permanently (max restarts exceeded), the exit handler clears the in-memory map entry AND deletes the corresponding rows from `state.db.architect` and `terminal_sessions`. *Rationale (architect override of builder recommendation)*: keep `state.db` an accurate mirror of reality. A ghost row creates a discoverability problem — the user sees an architect that doesn't actually exist anymore. Bringing back a removed architect is a fresh `add-architect` call with the same name — explicit, not implicit.
- **OQ-D → EXPANDABLE 'Architects' SECTION in VSCode sidebar.** The VSCode Workspace view collapses all architects under one "Architects" tree node. Expanded with N=1 still shows main inline-discoverable; with N>1 the user can pick. *Rationale*: matches VSCode tree conventions, scales to many siblings, doesn't clutter the sidebar at N=1.
- **OQ-G → PROMPT before closing a sibling tab, with informational sub-decision.** Clicking the X on a sibling architect tab shows a confirmation: "Remove architect `<name>`?" The dialog includes informational text about any in-flight builders this sibling spawned, but does NOT block removal (because OQ-A says "remove anyway"). *Rationale*: prevents accidental removals; surfaces the in-flight builders fact transparently without making it a barrier.

### Resolved (Non-blocking, recorded for plan)
- **OQ-C → Passive crash detection.** Lazy — discover on next route attempt via the existing `tower-messages.ts:336` fallback. No Tower-side heartbeat or polling.
- **OQ-E → Extend the pure `validateArchitectName` utility** with the reserved-name check for `main`. Tests live next to the utility.
- **OQ-F → `afx status` always enumerates architects** (`main` + siblings) unconditionally, for predictability.

### Plan-time note (architect direction, not a spec change)
When a sibling is removed, the dashboard's active-tab state must not be left pointing at the removed name. **Behaviour**: if the removed sibling was the active tab, switch active tab to `main`; if `main` was active, stay on `main`. The active-tab logic in `useTabs` must handle this without leaving `active = <removed-name>` stale. The plan should pin this in the implementation, not just leave it implicit.

## Performance Requirements

- **Architect persistence I/O**: <100ms per write/delete (SQLite-bound, no network).
- **Tower restart auto-rebind**: <2s for N ≤ 8 architects (matches existing reconciliation ceiling).
- **`afx status` output time**: no regression — extra enumeration is a Tower-side query on already-loaded state.
- **Dashboard tab strip render**: no measurable regression for N ≤ 8 architects.

## Security Considerations

- **Address grammar collisions**: Names containing `:` are already rejected by the regex. Preserve that.
- **Reserved name `main`**: Add an explicit reserved-name check so the protection isn't dependent on a race-free in-memory state.
- **Persistence file location**: `state.db` is already workspace-private with the existing trust model. No new exposure.
- **Architect-to-architect messaging**: Already exists via `architect:<name>` — this spec documents and tests it but does not change the trust model. All architects in a workspace are equally trusted; no per-architect ACLs.

## Test Scenarios

### Functional Tests
1. **Happy path — add, use, remove**: Add sibling `ob-refine`. Spawn a builder from it. `afx send architect` from the builder lands on `ob-refine`'s terminal. `remove-architect ob-refine` succeeds; sibling gone from in-memory map, `state.db`, dashboard, and `afx status`. Builder's subsequent `afx send architect` falls back to `main` per existing routing.
2. **Graceful-restart persistence**: Add sibling. `afx workspace stop` then `afx workspace start`. Verify: sibling is back in the in-memory map and dashboard, with a working PTY, and a builder it previously spawned can route to it (identity preserved via `CODEV_ARCHITECT_NAME`).
3. **Tower stop + start**: Add sibling. `afx tower stop` then start Tower. Same expectations as scenario 2.
4. **Crash recovery (regression)**: Add sibling. Kill Tower process directly (SIGKILL). Shellpers survive. Restart Tower. Verify sibling restored as today.
5. **Shellper auto-restart identity**: Add sibling. Kill its claude process directly. Shellper auto-restarts it. Verify the new claude process has `CODEV_ARCHITECT_NAME=<sibling-name>` in env (assertable via a builder spawned from it — that builder's `spawningArchitect` is the sibling, not main).
6. **Permanent exit fallback**: Force max-restart exhaustion on a sibling. Verify in-memory entry is cleared, the persisted rows in `state.db.architect` and `terminal_sessions` are auto-deleted (per OQ-B), `afx status` no longer lists the gone sibling, and `afx send architect` from builders spawned by it falls back to `main`.
7. **Naming validation**: Confirm `validateArchitectName` rejects: `main` (new reserved-name check), empty, whitespace-only, names with `:`, spaces, uppercase, underscores. Accept: `ob-refine`, `team-a`, `architect-2`.
8. **Architect-to-architect**: From `main`'s terminal, send to `architect:ob-refine` — lands on ob-refine. Reverse direction also works.
9. **Surface enumeration**: `afx status` lists `main` and any siblings with PID/port/terminal_id. VSCode sidebar shows all architects per OQ-D's resolution.
10. **Dashboard close affordance**: Click X on sibling tab → confirmation prompt appears ("Remove architect `<name>`?") with informational text about in-flight builders (per OQ-G). Confirm → architect removed via the same flow as CLI remove. Close button absent on `main` tab. After removal: if the removed sibling was the active tab, active tab is `main`; if `main` was active, stays active (per architect's plan-time note).
11. **Remove-with-in-flight-builders**: Add sibling, spawn a builder from it, remove the sibling while the builder is active. Removal succeeds (does not block per OQ-A). Builder's subsequent `afx send architect` lands on `main` per `tower-messages.ts:336` fallback.
12. **Auto-numbering after remove**: Add `architect-2`, `architect-3`. Remove `architect-2`. Add a new architect — its name is `architect-2` (gap-filled by existing `autoNumberArchitectName`).

### Non-Functional Tests
1. **Persistence performance**: Add 8 architects, restart Tower, time the rebind. Assert <2s total.
2. **Coverage no-regression**: Coverage report on touched files matches or exceeds pre-change baseline.
3. **UI smoke (Playwright)**: Render dashboard with N=1, N=2, N=3 architects. Visually verify tab strip, close button presence on siblings, absent on main, labels per [[feedback_ui_visual_verification]].

## Dependencies

- **External Services**: None.
- **Internal Systems**:
  - `packages/codev/src/agent-farm/utils/architect-name.ts` (reserved-name check)
  - `packages/codev/src/agent-farm/db/schema.ts` (read-only — schema is correct)
  - `packages/codev/src/agent-farm/state.ts` (`setArchitectByName`, new `removeArchitect`)
  - `packages/codev/src/agent-farm/servers/tower-instances.ts` (graceful-stop semantics, `launchInstance` re-spawn loop, new `removeArchitect` handler)
  - `packages/codev/src/agent-farm/servers/tower-terminals.ts` (identity-on-restart env injection at `:559-567` and `:773-776`; removal of v1 collapse at `:928-940`; possible changes to `deleteWorkspaceTerminalSessions` to preserve sibling rows on graceful stop)
  - `packages/codev/src/agent-farm/servers/tower-messages.ts` (regression-test only; existing routing is correct)
  - `packages/codev/src/agent-farm/commands/workspace-add-architect.ts` (no expected changes — already calls validation)
  - `packages/codev/src/agent-farm/commands/workspace-remove-architect.ts` (new)
  - `packages/codev/src/agent-farm/commands/status.ts` (enumeration)
  - `packages/codev/src/agent-farm/client/workspace-client.ts` (new `removeArchitect` RPC)
  - `packages/dashboard/src/components/ArchitectTabStrip.tsx` (close affordance render)
  - `packages/dashboard/src/components/TabBar.tsx` (no expected changes — `closable` flag plumbing already works)
  - `packages/dashboard/src/hooks/useTabs.ts` (`closable` flag wiring for sibling architects only — `main`'s tab stays `closable: false`)
  - `packages/vscode/src/views/workspace.ts` (sibling surfacing per OQ-D)
- **Libraries/Frameworks**: None new.

## References

- Issue [#786](https://github.com/cluesmith/codev/issues/786) — umbrella issue, this spec is its formalisation
- PR #757 / Spec 755 — multi-architect primitive (v3.0.5)
- PR #762 / Spec 761 — dashboard tab strip (v3.0.6)
- PR #775 / Bugfix #774 — routing fix (v3.0.8)
- [[feedback_e2e_headline_path]] — drives the verify-phase round-trip requirement
- [[feedback_ui_visual_verification]] — render-in-browser requirement for UI changes
- `codev/resources/arch.md` — Tower / shellper architecture overview

## Risks and Mitigation

| Risk | Probability | Impact | Mitigation Strategy |
|------|------------|--------|-------------------|
| Changing `stopInstance`'s row-delete semantics regresses some flow that relied on the current "stop wipes everything" behaviour | Medium | High | Plan phase enumerates callers of `deleteWorkspaceTerminalSessions` and writes regression tests for each before changing the semantics |
| Identity-on-restart env injection misses a code path (there are at least two `restartOptions` build sites in `tower-terminals.ts`) | Medium | Medium | Plan phase grep-audits all `restartOptions` constructions; tests assert env contents on each path |
| Removing the v1 collapse logic at `tower-terminals.ts:928-940` breaks consumers that depend on the single-Architect-tab API contract | Low | Medium | Plan phase greps for `'architect'` consumers of `workspace-terminals` API; introduces collection-aware shape with backwards-compat fallback if needed |
| Close affordance ripples into right-pane tabs unintentionally | Low | Low | Right-pane tabs already have close buttons; the new code only flips `closable` for sibling architects in `useTabs.ts:52`. Visual verification with Playwright at N=1/2/3 |
| Architect-to-architect messaging has unexpected behaviour due to hardcoded `'main'` somewhere | Low | Medium | Plan phase greps for hardcoded `'main'` usage; integration test exercises both directions |
| Reserved-name change breaks existing workspaces that somehow have a sibling literally named `main` | Very Low | Low | Validation applies only to new adds. Existing rows are loaded as-is. (Realistically impossible — current code collision-rejects.) |
| Auto-restart env-injection change ripples into `main`'s behaviour | Low | Medium | The change unconditionally injects `CODEV_ARCHITECT_NAME = dbSession.role_id || 'main'`; main's current implicit value is `main`, so behaviour is unchanged for main |

## Expert Consultation

**Date**: 2026-05-20 (iter-1)
**Models Consulted**: Gemini, Codex, Claude (via porch CMAP)
**Verdict**: REQUEST_CHANGES (Gemini, Codex), COMMENT (Claude)

**Sections Updated** based on iter-1 feedback:
- **Current State / Known gaps** rewritten: confirmed via code reading that siblings ARE persisted on add, right-pane tabs DO have close buttons, and the v1 collapse logic at `tower-terminals.ts:928-940` is the proximate cause of surface gaps. Original gap #2 (right-pane) dropped from scope; gap #3 (persistence) reframed as graceful-stop lifecycle problem, not write-path problem.
- **Constraints**: "mirror the builder pattern" replaced with "extend the existing reconciliation path" (per Claude — builders and architects already share `reconcileTerminalSessions`).
- **Success Criteria**: Added explicit identity-preservation criterion (per Codex — restored sibling must keep its architect identity, not just resurrect as a PTY). Added explicit removal of v1 collapse logic (per Gemini).
- **Naming Rules**: Reframed from "define rules" to "extend existing validator with reserved-name `main` check" (per Codex/Claude — existing regex already covers `:`, spaces, uppercase, etc.).
- **Open Questions**: OQ-1 (persistence model) resolved into the spec; OQ-2 (right-pane scope) dropped (not a real gap); OQ-3 renamed to OQ-A with a recommendation; new OQ-B (permanent-exit row deletion), OQ-D (VSCode shape) added.
- **Test Scenarios**: Added shellper-auto-restart identity test (per Codex), auto-numbering-after-remove test, Tower stop+start vs crash recovery distinction.
- **Dependencies**: `validateArchitectName` correctly attributed to `utils/architect-name.ts` (not `workspace-add-architect.ts` per Claude).

Note: All iter-1 CMAP feedback incorporated in iter-2. Architect resolutions for the four blocking OQs incorporated in iter-3. Awaiting iter-2 CMAP.

**Iter-3 (architect decisions, 2026-05-20)**:
- OQ-A resolved: remove anyway, fallback to main.
- OQ-B resolved: auto-delete persisted row on permanent exit (override of builder recommendation — architect rationale recorded in Architect Decisions section: state.db should mirror reality, no ghost rows).
- OQ-D resolved: expandable "Architects" sidebar section in VSCode.
- OQ-G resolved: prompt with informational sub-decision; remove not blocked (per OQ-A).
- Added plan-time direction on dashboard active-tab handling when sibling removed.

## Approval
- [ ] Architect Review (spec-approval gate)
- [x] Expert AI Consultation iter-1 complete
- [ ] Expert AI Consultation iter-2 complete (post architect decisions)

## Notes

All previously-blocking open questions are resolved as Architect Decisions above. Remaining non-blocking items (OQ-C/E/F) are recorded as resolved-for-planning. Iter-2 CMAP will review the spec with these decisions baked in.

The verify phase MUST include manual exercise of the headline value prop on a real workspace, per [[feedback_e2e_headline_path]]. Automated tests are necessary but not sufficient — the v3.0.5 → v3.0.7 routing break passed unit tests for three minor versions.

---

## Amendments

<!-- TICK amendments tracked here if needed in future. None at draft time. -->
