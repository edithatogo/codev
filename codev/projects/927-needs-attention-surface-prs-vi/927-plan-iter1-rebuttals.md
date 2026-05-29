# Plan #927 — Rebuttal to iteration-1 consultation

**Verdicts**: Gemini APPROVE · Claude APPROVE · Codex REQUEST_CHANGES (all HIGH confidence).

Codex's REQUEST_CHANGES were about making the plan a stronger *execution guide* (own the VSCode work concretely; align the "+ types" title with the file list) — not design disagreements. I **accept both** and updated the plan. Claude's two non-blocking observations are also addressed.

---

## Codex REQUEST_CHANGES

### C1 — VSCode blast radius is discussed, not concretely owned in a phase
**Accepted.** The cross-cutting section described the VSCode impact but left the work as a loose note rather than phase-owned. **Phase 1 now owns it:**
- **Files added to Phase 1**: `packages/vscode/src/test/builders.test.ts` (VSCode-side coverage).
- **Acceptance criteria added to Phase 1**: `packages/vscode` builds; a `verify-approval`-pending builder surfaces in the Builders tree as blocked with `blockedSince`; the gate-toast generic fallback (`{ label: 'Review', command: 'codev.openBuilderById' }`, verified at `gate-toast.ts:123`) handles `verify-approval` without error; **`pr`-gate VSCode behavior is unchanged** (regression-guarded by a test).
- **Test-plan items added to Phase 1**: the two VSCode-side tests above + VSCode build.
- The cross-cutting section's checkboxes are now explicitly labeled **"OWNED BY PHASE 1"** to remove the ambiguity Claude also flagged (obs-a).

### C2 — Phase 1 titled "+ types" but file list omits the type contract/docs
**Accepted.** Added `packages/types/src/api.ts` to Phase 1's file list: the `OverviewBuilder.prReady` doc comment (L183–194) still describes the old `pr_ready_for_human` + v3.1.3 fallback derivation; Phase 1 rewrites it to the gate-authoritative contract. Also added the mirrored `OverviewBuilder.prReady` comment in `overview.ts` to Phase 1's edit list. (The `recentlyMergedIssueIds` field at api.ts:250–259 remains a **Phase 3** removal — deliberately split so each commit stays green.)

---

## Claude APPROVE — observations
- **obs-a (VSCode test-scope ambiguity)**: resolved together with C1 — the VSCode test/build items are now Phase 1 acceptance criteria + test-plan items, labeled "OWNED BY PHASE 1."
- **obs-b (pre-existing `'dev review'` → `gateKindClass` styling gap)**: `GATE_LABELS['dev-approval'] = 'dev review'` but `gateKindClass` has a `'code review'` case (matching no live label) and no `'dev review'` case, so dev-approval rows already fall back to `--plan` styling. Since Phase 2 edits exactly this function, I added it as a **flagged optional drive-by**, **defaulting to NOT included** (it is pre-existing and out of #927's spec scope). Teed up as an explicit architect decision at plan-approval.

---

## Gemini APPROVE
No issues raised. Endorsed the shared-code update, the dashboard-local enforcement, the dependency ordering, and the graceful removal of the dead projection.

---

## Net
Both REQUEST_CHANGES items resolved by concretely assigning the VSCode validation and the type/doc edits to **Phase 1** (with acceptance criteria + tests), and by aligning the file list with the title. No phase or design changed in substance — the plan is now a tighter execution guide. Two coordination decisions are teed up for the human/Amr at plan-approval (VSCode verify-approval UX; optional dev-review styling drive-by), neither of which blocks the #927 contract.
