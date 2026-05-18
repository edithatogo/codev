I'll read the key source files referenced in the spec to verify its claims and assess feasibility.Let me check a few more details to verify the spec's accuracy.Now I have a thorough understanding of the codebase. Let me compile my review.

---

## Specification Review: 761 — Surface Multiple Architects in Tower Dashboard, VSCode Extension, and `afx status`

### Overall Assessment

This is an exceptionally well-written specification. The Current State section accurately describes the codebase (I verified every line reference), the scope is tightly bounded, the backward-compatibility constraints are explicit, and the acceptance criteria are testable. The architect's framing from issue #761 has been faithfully translated into a structured spec with clear plan-phase decision points.

### 1. Completeness

**Strengths:**
- Every collapse point (API → dashboard → VSCode → CLI) is identified with exact file/line references — all verified as accurate.
- The "Out of scope" and "Explicitly NOT in scope" sections are unusually precise, preventing scope creep.
- Open questions are properly triaged into "blocks progress" (none) vs "affects design" (deferred to plan phase) — this is the right call.

**Minor gaps:**
- **WebSocket lifecycle for multi-architect terminals.** The spec mentions `activatedTerminals` for persistence (test scenario NF-2) but doesn't discuss what happens when the user switches between architect tabs — specifically whether both terminals maintain active WebSocket connections or if only the visible one does. The current single-architect model has exactly one WS connection in the left pane. With N > 1, the plan phase should decide whether all N connections stay alive (simpler, more memory) or if inactive tabs tear down their WS (saves resources but adds reconnect latency). This is a plan-phase detail, but worth flagging in the spec's open questions since it affects the "no render flicker" non-functional requirement.
- **`/api/state` inline type vs `packages/types/src/api.ts`.** The `handleWorkspaceState` function in `tower-routes.ts:1452-1461` defines its response shape as an *inline type literal* rather than importing `DashboardState` from `packages/types/src/api.ts`. Any change must update **both** the inline type and the shared interface. The spec references both files but doesn't call out this dual-definition pattern — the plan phase should ensure they stay in sync.

### 2. Correctness

**All codebase claims verified:**
- ✅ `tower-routes.ts:1472-1486` — scalar architect emission from `entry.architects.get('main')` — confirmed at lines 1472-1487.
- ✅ `tower-terminals.ts:928-940` — single `TerminalEntry` with hard-coded `id: 'architect'` — confirmed.
- ✅ `tower-types.ts:41-46` — `architects: Map<string, string>` — confirmed at lines 41-42.
- ✅ `useTabs.ts:27-29` — single architect tab push from `state.architect` — confirmed at lines 26-28.
- ✅ `workspace.ts:23-34` — single `TreeItem('Open Architect')` — confirmed at lines 25-33.
- ✅ `extension.ts:140-157` — `codev.openArchitectTerminal` reading scalar `state.architect.terminalId` — confirmed.
- ✅ `status.ts:44-71` — Tower-running path printing terminals — confirmed.
- ✅ `status.ts:82-92` — Tower-not-running path reading local state — confirmed at lines 82-91.
- ✅ `schema.ts` — `architect.id TEXT PRIMARY KEY` (name) and `builders.spawned_by_architect TEXT` — confirmed at lines 18-25 and 44.
- ✅ `state.ts` — `main`-only shim, querying `WHERE id = 'main'` — confirmed.

**One minor inaccuracy:** The spec says `App.tsx:256` filters `t.type === 'architect'` from the right TabBar. The actual code at line 256 is `tabs.filter(t => t.type !== 'architect')` — same logic, but the spec uses `===` when it should say `!==` (or "filters out architect type"). This doesn't affect the spec's correctness — just a wording imprecision.

### 3. Feasibility

**Highly feasible.** The change is purely additive across well-separated layers:
- The API layer adds a collection field alongside an existing scalar.
- The dashboard React change is a conditional tab-strip inside a pane that already handles terminal persistence.
- The VSCode extension change is a loop replacing a singleton.
- The CLI change is a new flag + header line.

**No architectural risk.** The foundation from spec #755 is solid — the `Map<string, string>` is already collection-shaped, the DB schema already stores names, and the routing layer is untouched.

### 4. Edge Cases and Error Scenarios

**Well covered:**
- Dead architect terminal (scenario 6) — deferred to plan-phase but acknowledged.
- Unknown deep-link name (scenario 8) — falls back gracefully.
- `--architect nonexistent` error path (scenario 4) — clear error with listing.
- Active-tab `localStorage` collision (scenario 7) — documented as last-write-wins.

**One edge case not covered:**
- **Architect registers while dashboard is open.** If a second architect is added (`afx workspace add-architect`) while the dashboard is already loaded, how does the dashboard discover it? The current `/api/state` polling (or SSE push — I didn't check which) should handle this naturally, but it's worth a sentence confirming that the existing refresh mechanism suffices. If the dashboard relies on initial load only, the new architect tab won't appear until manual refresh.

### 5. Security Considerations

Adequate. The spec correctly notes that names are not secrets, no new auth surfaces are introduced, and `/api/state` scoping is already per-workspace. No concerns.

### 6. Testing Strategy

**Thorough and well-structured.** The test matrix covers:
- Single-architect regression (critical for the "zero visual change" constraint)
- Multi-architect functional tests across all four surfaces
- Deep-link backward compatibility
- Non-functional render-flicker and payload-size parity

**One suggestion:** The spec mentions "byte-identical" layout for N=1 but this is hard to assert literally in a React rendering context. The plan phase should interpret this as "DOM-structurally identical" or "snapshot-identical" rather than literal byte comparison of rendered HTML. The spec's later mention of "snapshot / DOM-presence tests" suggests this is already the intent, but the language could be clearer.

### 7. VS Code Sidebar Label Change

The spec proposes changing the N=1 label from `Open Architect` to `main`. This is a deliberate, small UX regression for solo-architect users — the label goes from action-oriented ("Open Architect") to identity-oriented ("main"). The spec acknowledges this as "the only delta" and justifies it for naming consistency. This is reasonable, but it's worth noting that `main` is less self-explanatory to new users than `Open Architect`. The plan phase might consider `Architect (main)` as a compromise, or deferring the label change until N > 1.

---

VERDICT: APPROVE
SUMMARY: Exceptionally thorough spec with verified codebase references; two minor gaps (WebSocket lifecycle for N>1 tabs, inline-type dual-definition pattern) are plan-phase concerns, not blockers.
CONFIDENCE: HIGH

---

KEY_ISSUES:
- None that block progress. Two items for plan-phase awareness:
  1. WebSocket lifecycle when switching between multiple architect tabs in the left pane (persist all connections vs teardown inactive ones) — should be noted as a plan-phase decision.
  2. The inline type literal in `tower-routes.ts:1452-1461` must be updated alongside `DashboardState` in `packages/types/src/api.ts` — the plan should call this out explicitly to avoid drift.
- Minor: consider whether renaming the VSCode sidebar label from "Open Architect" → "main" for N=1 users is the right default, or whether a less-jarring label like "Architect (main)" might serve both audiences.