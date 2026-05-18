# Plan 761 — Iteration 1 Review Rebuttals

## Verdicts

| Model | Verdict |
|-------|---------|
| Gemini | REQUEST_CHANGES |
| Codex | (unavailable — see below) |
| Claude | COMMENT |

## Gemini REQUEST_CHANGES — all three issues addressed

### 1. Tab ID convention breaks N=1→N=2 transition

> The plan decides to use `id: 'architect'` for N=1 and `id: 'architect:main'` for N>1. If a user adds an architect dynamically (N=1 → N=2), `main`'s ID will suddenly change. The `useTabs` auto-switch logic will see *both* the renamed `main` and the new `sibling` as "genuinely new tabs", leading to unpredictable focus stealing. It also unnecessarily clears `main` out of the `activatedTerminals` set.

**Resolution**: Pin revised. The first architect (always `main` per Phase 1's main-first ordering) gets bare `id: 'architect'` *regardless* of N. Subsequent architects get `id: 'architect:<name>'`. N=1 keeps snapshot stability AND `main`'s ID is stable across the entire workspace lifecycle. Plan note 1 updated.

### 2. `localStorage` key collision via `workspaceName`

> I've audited `tower-routes.ts`: `workspaceName` is simply `path.basename(workspacePath)`. If a user has `~/work/codev` and `~/personal/codev`, both return `workspaceName: 'codev'` and will overwrite each other's active tabs.

**Resolution**: Helper revised to read `window.location.pathname` (URL-encoded, globally unique per workspace). Plan's "localStorage helper" section updated with the audit rationale.

### 3. `toolbarExtra` in extracted render helper

> The `Terminal` component in the left pane requires the `toolbarExtra={architectToolbarExtra}` prop to render the collapse buttons. Ensure the refactored helper accepts an optional `toolbarExtra` argument.

**Resolution**: Helper signature updated to `renderPersistentTerminals(tabsToRender, activeTabId, toolbarExtra?)`. Threading rule pinned: "on the active terminal only" — within the loop, pass `toolbarExtra` only when `tab.id === activeTabId`. (Both gemini and claude flagged this.) Plan note 3 added.

## Claude COMMENT — main issue addressed

### A. `DashboardState` import will fail due to `Annotation.parent` mismatch

> The shared `Annotation` interface in `packages/types/src/api.ts:43-49` has a **required** `parent: { type: string; id?: string }` field. But the handler at `tower-routes.ts:1526-1533` builds annotations **without** `parent`. If you type `state` as `DashboardState`, TypeScript will error.

**Resolution**: Phase 1 deliverables expanded to include a small companion type fix — make `Annotation.parent` optional in the shared type. **Plan-time audit done**: `grep -rn "annotation\.parent\|ann\.parent" packages/` returns only `agent-farm/state.ts:287-288` and `agent-farm/db/migrate.ts:99-100`, both of which use the *agent-farm-internal* `Annotation` type (`packages/codev/src/agent-farm/types.ts:29`), NOT the shared one. The shared `Annotation.parent` has zero callers. Making it optional aligns the shared type with reality and unblocks the clean `DashboardState` import. Plan note 4 added.

A `satisfies Pick<DashboardState, 'architect' | 'architects'>` fallback is documented for any unforeseen future mismatch.

### B. `architectToolbarExtra` prop threading unspecified

Same as Gemini #3. Addressed.

## Codex unavailable

Same environment issue as spec phase. Architect previously accepted 2-of-3 result; same here.

## Net change to plan from iter-1

- Tab ID convention: revised from asymmetric-by-N to first-vs-rest.
- localStorage key: pinned to `window.location.pathname`.
- `toolbarExtra` threading: pinned (active-terminal only).
- `Annotation.parent`: companion type fix added to Phase 1 (1-character change in shared type).
- All decisions documented in plan's "Notes" section with iter-1 review provenance for traceability.

Ready for plan-approval gate.
