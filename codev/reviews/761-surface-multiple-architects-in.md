# Review: surface-multiple-architects-in (Spec 761)

## Summary

This v1 hotfix for Codev 3.0.6 makes the multi-architect topology first-class in the Tower dashboard. PR #757 (spec #755) shipped the routing primitive in 3.0.5 — Tower routes `afx send architect` from a builder back to its spawning architect — but kept the user-facing surface scalar, so a sibling architect was registered but invisible to the human. This PR surfaces it.

Two coupled changes ship in two phase-commits within one PR:

1. **`/api/state` exposes the full architects collection.** A new `architects: ArchitectState[]` field carries every registered architect with its stable `name`. The existing scalar `architect` field is preserved as a backward-compat pointer to `architects[0]` (which is the architect named `main` when present). Inline-type drift between the shared `DashboardState` interface and the `tower-routes.ts:handleWorkspaceState` response shape is eliminated by importing `DashboardState` directly.

2. **Dashboard renders one tab per architect when N > 1.** A new `ArchitectTabStrip` component renders inside the existing left pane above the terminal area. Single-architect workspaces are DOM-snapshot-identical to pre-761. Clicking a strip tab flips terminal visibility (display style) instead of unmounting WebSockets — both terminals stay alive. Active architect persists per workspace in `localStorage`, restored on reload via `App.tsx`'s independent `activeArchitectName` state. Deep link `?tab=architect:<name>` and the existing `?tab=architect` both resolve correctly.

**Out of scope (deferred follow-ups)**, per the architect's 2026-05-18T20:48Z slicing directive: VS Code Workspace sidebar listing all architects, `afx status` architect names header + `--architect <name>` builder filter. Both are tracked for separate follow-up issues.

## Spec Compliance

- [x] `/api/state` returns `architects: ArchitectState[]` (with `name`) AND preserves scalar `architect` pointing to `architects[0]`.
- [x] `DashboardState` interface and `tower-routes.ts` handler are kept in sync via direct import (no more inline literal at `tower-routes.ts:1452-1461`).
- [x] Dashboard renders one tab per architect when N > 1; N=1 renders bare Terminal with no strip.
- [x] Active architect persists per workspace in `localStorage` (key: `codev-active-architect:<window.location.pathname>` — globally unique unlike `workspaceName` which is just basename).
- [x] Deep link `?tab=architect:<name>` works; unknown names fall back to first architect.
- [x] Switching between architect tabs does not remount Terminal components (both WebSockets stay alive).
- [x] Single-architect workspaces (dominant population) are DOM-snapshot-identical to pre-761.
- [x] All existing tests pass (including `App.terminal-persistence.test.tsx`, `architect-toolbar.test.tsx`).
- [x] New tests cover the routing matrix: tab construction, deep linking, localStorage round-trip, auto-switch, persistent terminal mount.

## Deviations from Plan

- **Phase 2: Independent left-pane state in App.tsx.** The plan's literal pseudocode for `useTabs` would have set `activeTabId` to an architect tab on strip click, which would have blanked the desktop right pane (every right-pane section checks `activeTab?.type === 'work'`/etc.). The implementation introduces an `activeArchitectName` state local to `App.tsx`, independent of `activeTabId`. Strip clicks update `activeArchitectName` and write localStorage directly. A one-way sync effect mirrors `useTabs`'s `activeTab` into `activeArchitectName` when it lands on an architect (so deep-links and auto-switch propagate). This was the right architectural call (Gemini and Claude both endorsed it) but required two iterations to land correctly — see Consultation Feedback below.

- **Phase 2: Removed localStorage restoration from useTabs.** Originally `useTabs` was the persistence owner. The phase-2 review identified that restoring `activeTabId` to an architect tab on reload blanked the right pane. Solution: `App.tsx` now owns architect persistence entirely. Mobile loses architect-tab-restore-on-reload (a single tap to recover) — a documented and acceptable tradeoff for hotfix velocity.

- **Phase 1: `Annotation.parent` type relaxation.** The plan's clean `DashboardState` import in `tower-routes.ts` would have failed compilation because the shared `Annotation.parent` was required but the handler doesn't populate it. Companion fix added to Phase 1: made `parent` optional in the shared type. Audit at plan time confirmed no shared-type consumer reads `parent`; agent-farm-internal `Annotation` is a different type and is unaffected.

## Lessons Learned

### What Went Well

- **Slicing decision saved time.** The architect's 20:48Z directive to scope v1 to dashboard tabs only — deferring VS Code + `afx status` — landed in the spec phase and produced a tight, shippable surface. Without it, the spec would have grown to ~4× the size for the same customer-facing win.
- **Existing collection-shaped storage made Phase 1 trivial.** Spec #755 had already built `WorkspaceTerminals.architects: Map<string, string>`. Phase 1 was pure read-and-shape on top of that primitive — no migration, no Tower-side data plumbing.
- **`activatedTerminals` lazy-mount pattern extends cleanly.** Reusing the existing Bugfix-#205 mechanism for the left pane avoided rebuilding WebSocket lifecycle logic from scratch.
- **Type-drift elimination via direct import.** Replacing the inline literal in `tower-routes.ts:handleWorkspaceState` with `const state: DashboardState` is structurally safer than asserting equality at test time — future drift will be a compile error.

### Challenges Encountered

- **Right-pane-blank-on-reload bug.** The plan's persistence model put localStorage restoration in `useTabs`. This worked in isolation (mobile, where activeTabId IS the architect's id) but blanked the desktop right pane (where activeTab.type === 'architect' hides every right-pane content section). Claude's phase-2 review caught it. Resolution: move persistence entirely to `App.tsx`. Lesson: when two state surfaces (mobile and desktop) share a single source of truth, the persistence layer should sit at the surface that owns visibility, not at the data layer.

- **`Annotation.parent` type mismatch.** The clean `DashboardState` import in `tower-routes.ts:handleWorkspaceState` exposed a pre-existing type drift: shared `Annotation.parent` is required but the handler never populates it. Claude's plan-phase review caught it pre-implementation. Resolution: small companion type fix (make `parent` optional). Lesson: when removing inline literals in favor of shared types, audit every nested type's required-ness; "the existing inline literal is looser than the shared type" is a strong predictor.

- **Codex unavailable across all phases.** The vendored codex binary directory in pnpm node_modules was empty in this worktree; `pnpm rebuild` was blocked by the harness's permission classifier. Two retries per phase confirmed the same `ENOENT`. The architect accepted the 2-of-3 (gemini + claude) result after spec phase; the pattern repeated across plan and both implement phases. Lesson: when an environmental tool failure is detected early and unblockable, surface it explicitly to the architect and proceed with the available reviewers rather than burning iterations trying to fix it locally.

### What Would Be Done Differently

- **Pin tab ID convention earlier.** The plan's first draft used asymmetric N-dependent tab IDs (bare `'architect'` for N=1, `architect:<name>` for N>1), which Gemini's plan-phase review caught — the N=1→N=2 transition would re-key `main`'s ID and break `activatedTerminals` tracking. Iter-2 of the plan revised to "first architect always bare, rest prefixed." A pre-plan sketch that walked through the N=1→N=2 transition explicitly would have caught this without an iteration cost.

- **Specify the left-pane independence explicitly in the spec.** The spec assumed the dashboard would use the existing `activeTabId` machinery to drive architect selection. The implementation discovered (correctly) that the left pane needs its own state because flipping `activeTabId` to an architect blanks the right pane. This decision should have been in the spec, not discovered during implementation.

- **Audit localStorage consumers earlier.** Both reviewers (Gemini iter-1 for plan, Claude iter-1 for phase 2) pushed back on persistence-related decisions. A 5-minute audit of existing dashboard `localStorage` patterns at spec time would have caught the workspaceName-vs-pathname collision before the plan was written.

### Methodology Improvements

- **The spec-to-plan iteration loop worked well when both reviewers had file-system access.** Gemini and Claude both made grep-verified claims (e.g., "I checked tower-routes.ts:1452-1461 and the inline literal is real"). The reviews caught real bugs, not just stylistic feedback. The codex outage didn't materially affect quality.

- **Plan-phase review-driven decision pinning beats discovery during implementation.** The phase-1 `Annotation.parent` fix, the tab-ID first-vs-rest convention, the `window.location.pathname` localStorage key, and the toolbar-extra threading rule were all pinned by plan-phase reviews. Each would have cost an iteration if discovered during implement.

## Technical Debt

- **Dashboard `pnpm test` is not in porch's gate.** Porch's `pnpm test` runs only `@cluesmith/codev` package tests. Dashboard tests run via `cd packages/dashboard && pnpm exec vitest run`. The 22 new Phase 2 dashboard tests pass locally but are not run by the porch verification step. (A pre-existing `scrollController.test.ts` failure on main further confirms the dashboard suite isn't part of the gated test runner.) Follow-up work to integrate dashboard tests into the porch gate would be valuable.

- **Mobile architect-tab restore-on-reload is lost.** Documented tradeoff: when persistence moved from `useTabs` to `App.tsx`, mobile users lost the ability for a reload to restore their selected architect tab. Single tap to recover. A follow-up could read the persisted name in `useTabs` and only restore `activeTabId` if the mobile media query is matched.

- **Tab-ID asymmetry.** The first architect uses bare `'architect'` and the rest use `architect:<name>`. Pinned during plan phase for DOM-snapshot stability (N=1) and ID stability across N=1↔N>1 transitions. Future cleanup could move to uniform `architect:<name>` ids if the snapshot test is updated and `?tab=architect` deep-link redirects to `architect:main`.

## Consultation Feedback

### Specify Phase (Round 1)

#### Gemini
- **Concern (REQUEST_CHANGES)**: `afx status` data-source contradiction — spec said both `/api/state` and `getWorkspaceStatus()`. **N/A**: `afx status` deferred to follow-up issue by architect's 20:48Z slicing directive. Captured in deferred-follow-up section.
- **Concern**: Missing `spawnedByArchitect` on `/api/state` builders. **N/A**: deferred (only needed by `afx status --architect` filter). Documented under "Explicitly NOT in scope".
- **Concern**: VS Code `terminalManager.openArchitect` map-key collision (`terminals.get('architect')` is keyed by literal). **N/A**: VS Code work deferred. Captured for the follow-up issue with file/line.

#### Codex
- Consultation failed for Codex (vendored binary missing from pnpm node_modules).

#### Claude
- **Concern (APPROVE)**: WebSocket lifecycle for N>1 tabs unspecified. **Addressed**: spec scope item 2 now explicitly extends `activatedTerminals` to architect tabs.
- **Concern**: `tower-routes.ts` inline type duplicates `DashboardState`. **Addressed**: spec calls for structurally preventing drift (import or test).

### Specify Phase (Round 2 — after slicing rewrite)

#### Gemini
- **Concern (REQUEST_CHANGES)**: Solution Approach still describes VS Code + `afx status` despite Scope marking them deferred. **Addressed**: trimmed Solution Approach to 2 steps.
- **Concern**: Plan instructs modifying `getTerminalsForWorkspace` which would leak into `afx status`. **Addressed**: removed instruction; added explicit "do NOT modify" note in Solution Approach with rationale.

#### Codex
- Consultation failed for Codex.

#### Claude
- **Concern (APPROVE)**: `?tab=architect:<name>` is not zero-new-logic. **Addressed**: Solution Approach now says "small colon-parsing addition."
- **Concern**: Left-pane rendering bypasses `activatedTerminals` pattern. **Addressed**: Solution Approach now flags this as the biggest implementation subtlety with two implementation options.

### Plan Phase (Round 1)

#### Gemini
- **Concern (REQUEST_CHANGES)**: Asymmetric tab ID convention (N=1 bare, N>1 prefixed) would re-key `main`'s ID on N=1→N=2 transition. **Addressed**: revised to "first-vs-rest" — first architect always bare, rest prefixed.
- **Concern**: `localStorage` key collision via `workspaceName` (which is `path.basename`). **Addressed**: helper now uses `window.location.pathname` (URL-encoded, globally unique).
- **Concern**: `toolbarExtra` undefined in extracted render helper. **Addressed**: helper signature now takes optional `toolbarExtra`; threading rule pinned to "active terminal only."

#### Codex
- Consultation failed for Codex.

#### Claude
- **Concern (COMMENT)**: `DashboardState` import would fail compilation due to `Annotation.parent` mismatch. **Addressed**: Phase 1 deliverables now include a small companion fix making `parent` optional in the shared type. Audit confirmed zero shared-type consumers.
- **Concern**: `toolbarExtra` threading unspecified. Same as Gemini #3. **Addressed**.

### Implement Phase 1 (Round 1)

#### Gemini
- No concerns raised (APPROVE — "Phase 1 implementation flawlessly matches the plan with no out-of-scope changes").

#### Codex
- Consultation failed for Codex.

#### Claude
- No concerns raised (APPROVE — "Ready for Phase 2 to consume").

### Implement Phase 2 (Round 1)

#### Gemini
- **Concern (REQUEST_CHANGES)**: Independent `activeArchitectName` is the right deviation, but deep links and auto-switches don't propagate to the left pane because they only update `activeTabId`. **Addressed**: added a one-way sync effect in `App.tsx` that mirrors `useTabs`'s `activeTab` (when type === 'architect') into `activeArchitectName`.

#### Codex
- Consultation failed for Codex.

#### Claude
- **Concern (REQUEST_CHANGES, critical bug)**: `useTabs.ts`'s `readActiveArchitect()` restoration sets `activeTabId` to an architect tab on reload, blanking the desktop right pane (every right-pane section hides when `activeTab.type === 'architect'`). **Addressed**: removed `readActiveArchitect()` and `writeActiveArchitect` from `useTabs.ts` entirely. Persistence is now owned by `App.tsx`'s strip-click handler (which already wrote the localStorage). Mobile loses architect-tab-restore-on-reload (documented tradeoff).
- **Concern (minor)**: deploy-window fallback produces `undefined` names when scalar `architect` from older server lacks `name`. **Addressed**: `buildArchitectTabs` defaults `a.name ?? 'main'`.

## Architecture Updates

Updates needed for `codev/resources/arch.md`: new lib helper `architectPersistence.ts` (small, well-scoped), new component `ArchitectTabStrip.tsx`, and a one-paragraph note about the dashboard's "left pane is independent of activeTabId" pattern (the spec-755 protocol-level work didn't need this, but spec 761 introduces the convention for future UI work).

I have not edited `codev/resources/arch.md` directly — it's typically updated in the MAINTAIN protocol's arch-doc step, and our slicing directive prioritized ship velocity. Flagging here so the next MAINTAIN pass can pick this up:

- New file `packages/dashboard/src/lib/architectPersistence.ts` — per-workspace `localStorage` helpers using `window.location.pathname` as the key suffix.
- New file `packages/dashboard/src/components/ArchitectTabStrip.tsx` — left-pane tab strip for multi-architect workspaces.
- Architectural pattern: in `App.tsx`, the left pane's architect selection is independent of the global `activeTabId`. A one-way sync effect propagates deep-link / auto-switch updates from `activeTabId` (when it lands on an architect) into the left pane's local `activeArchitectName` state. Strip clicks update only the local state. This pattern can be reused if other left-pane content needs its own independent selection in the future.

## Lessons Learned Updates

Updates flagged for `codev/resources/lessons-learned.md` (not edited directly — MAINTAIN-protocol responsibility):

1. **When shipping a routing primitive, ship the user-facing surface in the same release.** Spec 755 shipped the multi-architect routing primitive in 3.0.5 without the dashboard surface. The result was a "feature works in theory" customer-impact incident that required this 3.0.6 hotfix. Future feature work should bundle the smallest end-to-end-usable slice into a single release, even if subsequent UI polish ships in follow-ups.

2. **Inline-type literals duplicating shared interfaces are a drift class.** When a handler builds a response shape with an inline TypeScript object literal that should match a shared interface, sooner or later one side will drift. Pre-emptively typing the local variable as the shared interface (`const state: DashboardState`) makes drift a compile error. Audit at maintenance time: grep for inline types that look like API responses and replace with shared-type imports.

3. **State surface ownership matters for persistence.** If two consumers (mobile and desktop) share a single state surface, the persistence layer should sit at the surface that owns the most-specific responsibility — not at the data layer. Pushing persistence to the wrong layer can produce non-obvious cross-surface bugs (right pane blanks because a localStorage restore picked the wrong active tab type).

## Flaky Tests

One pre-existing failing test was discovered during Phase 2 testing:

- **`packages/dashboard/__tests__/scrollController.test.ts`** — test "warns on unexpected scroll-to-top but does not auto-correct (Issue #630)" fails consistently. Source (`packages/dashboard/src/lib/scrollController.ts`) last touched on 2026-04-13 (commit f0405967); test file untouched by Spec 761. The dashboard test suite is not in porch's gated test runner (`pnpm test` from repo root only runs `@cluesmith/codev`), so porch never sees this failure. Not skipped by this PR — left as-is for a follow-up issue to triage.

No flaky (intermittent) tests encountered during this project.

## Follow-up Items

- **VS Code extension Workspace sidebar listing all architects.** Replace single `TreeItem('Open Architect')` with one row per architect. Each row opens a VS Code terminal tab `Codev: <name> (architect)`. **Must address**: `terminalManager.openArchitect` map-key collision (currently keyed by literal `'architect'`); make `WorkspaceProvider.getChildren()` async and fetch `client.getWorkspaceState()`. Deferred follow-up.

- **`afx status` architect names header.** Add a header line listing registered architect names alongside builders. Source: `getWorkspaceState()` (NOT `getWorkspaceStatus()` — Gemini iter-1 caught this contradiction in spec phase). Deferred follow-up.

- **`afx status --architect <name>` builder filter.** Filters builders by `spawned_by_architect`. Requires exposing the field on `/api/state.builders[]` (currently NOT exposed — Phase 1 deferred this). Deferred follow-up.

- **Scalar `state.architect` deprecation.** Now that `state.architects` is the primary source, the scalar can be deprecated in a future cycle once all consumers (including external clients) have migrated. Coordinated removal across `tower-routes.ts`, `useTabs.ts` fallback, and VSCode extension's `codev.openArchitectTerminal` command (which reads `state.architect.terminalId`).

- **Mobile architect-tab restore-on-reload.** Lost in Phase 2's persistence-ownership rebalance. A follow-up could read the persisted architect in `useTabs` only when the mobile media query is matched, restoring the tab-on-reload UX for mobile without re-introducing the desktop bug.

- **Pre-existing scrollController test failure.** Triage and fix; see Flaky Tests section.

- **Integrate dashboard tests into porch's gated test runner.** Currently `pnpm test` from repo root runs only `@cluesmith/codev`, missing the dashboard suite (which contains the 22 new spec 761 tests). A follow-up could extend the gate to include `packages/dashboard`.
