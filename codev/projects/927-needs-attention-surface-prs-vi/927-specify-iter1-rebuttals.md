# Spec #927 — Rebuttal to iteration-1 consultation

**Verdicts**: Gemini APPROVE · Claude APPROVE · Codex REQUEST_CHANGES.

Codex's REQUEST_CHANGES raised two *clarity* gaps (not design disagreements). I **accept both** and have updated the spec. Gemini and Claude were APPROVE with COMMENT-level items, which I also incorporated. Below I address each, note the change, and flag two reviewer suggestions I deliberately did **not** apply verbatim because they were incorrect.

---

## Codex REQUEST_CHANGES

### C1 — Pin down shared `blocked`/`blockedGate`/`blockedSince` semantics for the `pr` gate
**Accepted.** The spec was ambiguous about whether removing the builder stand-in is global or dashboard-local. **Resolution: dashboard-local.** New subsection *"Scope of the no-builder-stand-in rule"* in Desired State:
- `pr` **stays** in shared `GATE_LABELS` / `detectBlocked` / `detectBlockedGate` / `detectBlockedSince`. VSCode (tree/toast/status bar) is builder-centric and *should* keep surfacing a pr-gate-pending builder as a blocked builder — existing, correct behavior preserved.
- The "PR-as-PR-row, never builder-row" rule is enforced **only** in the dashboard `buildItems` via an early `if (b.prReady) continue;` (which also subsumes the deleted builder-emit branch).
- **Timestamp consequence made explicit**: because `pr` stays in `detectBlockedSince`, a pr-gate builder still carries `blockedSince = gateRequestedAt['pr']`, so the PR row's waiting-since chip keeps measuring *gate-requested time* (satisfying success criterion 1). This also closes Claude's COMMENT #2 (waitingSince source).

### C2 — `verify-approval` has no defined human-facing label/string contract
**Accepted.** New subsection *"Human-facing label contract for `verify-approval`"*:
- `GATE_LABELS['verify-approval'] = 'verify review'` (mirrors `spec review`/`plan review`).
- Add `gateKindClass('verify review') → 'attention-kind--verify'` and a new `.attention-kind--verify` CSS rule (today only `--pr/--spec/--plan/--code-review` exist; unmapped labels fall back to `--plan`).
- VSCode gate-toast `GATE_ACTIONS` uses its generic fallback for `verify-approval` — acceptable, no change needed.

---

## Gemini APPROVE — COMMENT items
- **`detectBlockedSince` "implementation trap"** (hardcoded gate array distinct from `GATE_LABELS`): **accepted** — documented as a separate sync point in Current State; recommend unifying all three `detectBlocked*` functions on `Object.keys(GATE_LABELS)` so the gate set lives in one place.
- **`if (b.prReady) continue;`** as the clean replacement for the builder-emit block: **adopted** in the dashboard-local subsection.
- **Remove `recentlyMergedIssueIds` end-to-end**: **accepted** (success criteria + non-functional test).
- **Gate-authoritative `derivePrReady`**: **accepted** as the selected approach.

## Claude APPROVE — COMMENT items
- **#1 `detectBlockedSince` sync point**: covered (see above).
- **#2 `waitingSince` source after `pr` handling**: resolved by keeping `pr` in `detectBlockedSince` (see C1).
- **#3 `gateKindClass` needs a `verify-approval` case**: covered (see C2).
- **#5 three existing tests need inverting, not one**: **accepted** — enumerated the three `NeedsAttentionList.test.tsx` tests (invert ~183 and ~253; remove ~222 merged-suppression) and dropped the conditional on the verify-approval test scenario.

---

## Two reviewer suggestions I did NOT apply verbatim (verified incorrect)

1. **Gemini: "redefine `derivePrReady` to simply check `parsed.gates['pr'] === 'pending'`."**
   **Rejected as written.** Porch initializes *every* gate to `status: pending` with **no `requested_at`** at project creation (verified in this project's own `status.yaml` — `pr`, `spec-approval`, `plan-approval`, `verify-approval` all start `pending`). A bare `=== 'pending'` check would mark *every freshly-initialized project* as PR-ready. The predicate must be **`status: pending` AND `requested_at` present**. Captured as a correctness invariant + a dedicated test scenario. (Gemini's *intent* — gate-authoritative — is adopted; only the exact predicate is corrected.)

2. **Gemini: "delete the `fetchRecentMergedPRs` helper in github.ts."**
   **Rejected.** Verified against `overview.ts`: `fetchRecentMergedPRs`'s result (`mergedPRs`) is consumed **twice** — once for `recentlyMergedIssueIds` (being removed) and once at ~line 971 to build the `issueToPrUrl` map enriching the **recentlyClosed** section with PR links. The helper and its fetch are **retained**; only the `recentlyMergedIssueIds` projection and its consumers are removed. Documented in Current State + success criteria.

---

## Net
Both REQUEST_CHANGES items are resolved by explicit spec additions; all APPROVE COMMENTs incorporated; two over-broad suggestions corrected with code-grounded reasoning. Design is unchanged from the unanimous Approach 1; the spec is now unambiguous enough to plan/implement from directly.
