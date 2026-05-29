# Review: Needs Attention — surface PRs via the universal `pr` gate; delete gateless builder-derived fallbacks

## Summary

Reworked the dashboard's **Needs Attention** surface so PR-readiness is keyed on the **universal `pr` gate** instead of fragile builder-state derivations. Three SPIR phases, net **deletion** (+227 / −272 = **−45 LOC** across `packages/`): removed the `derivePrReady` `bugfix && verified` fallback, the `NeedsAttentionList` builder-emit branch, the `pr_ready_for_human` field *dependency*, and the `recentlyMergedIssueIds` projection; added one gate (`verify-approval → "verify review"`) to the shared human-gate allowlist. Behavior is now: **(A)** open PRs whose linked builder has a pending `pr` gate → PR rows only; **(B)** gate rows for spec/plan/dev/verify-approval; never a builder standing in for a PR.

## Spec Compliance

- [x] **PR-surfacing keys on the `pr` gate** — `derivePrReady` reduced to the `requested_at`-aware `pr`-gate-pending check (Phase 1).
- [x] **No builder-stand-in** — builder-emit branch deleted; `if (b.prReady) continue;` excludes PR-ready builders from the gate-row loop (Phase 2).
- [x] **Merged PRs drop automatically** — open-only `pendingPRs` + no builder-emit ⇒ a missing PR yields no row, no suppression list (Phase 2/3).
- [x] **Gate rows for spec/plan/dev/verify-approval** — `verify-approval` added to `GATE_LABELS` as `"verify review"` + `gateKindClass` + `.attention-kind--verify` CSS (Phase 1/2).
- [x] **`pr` gate excluded from the dashboard gate-row path** (dashboard-local), while **kept** in shared `GATE_LABELS`/`detectBlocked*` so VSCode is unaffected (Phase 1/2).
- [x] **Gate-pending predicate is `requested_at`-aware** — guards freshly-initialized projects (Phase 1, dedicated test).
- [x] **Unaffiliated/human-PR fallback preserved** (`REVIEW_REQUIRED`, no builder) — and is now the *only* place `pr.createdAt` is used for waiting-time (Phase 2, post-Codex fix).
- [x] **`recentlyMergedIssueIds` removed end-to-end**; **`fetchRecentMergedPRs` retained** (recentlyClosed PR-link enrichment) (Phase 3).
- [x] **#919 reconciled** — see Follow-up Items; the `verified → complete` rename is *not* done here.

## Deviations from Plan

- **Phase 2 (iter-2, Codex CMAP)**: the initial Phase 2 carried over a `waitingSince: readySince || pr.createdAt` fallback and two tests encoding the now-impossible gateless-BUGFIX shape (`prReady` with no gate/no `blockedSince`). Fixed: affiliated PRs use the gate timestamp exclusively (`createdAt` reserved for unaffiliated PRs); the two obsolete-shape tests were reframed/removed. No plan-phase boundaries changed.
- **Worktree setup**: this repo has no `worktree.postSpawn`, so the worktree spawned without `node_modules`; ran `pnpm install --frozen-lockfile` before builds/tests. (See Follow-up Items.)

## Key Metrics

- **Commits**: 26 on the branch (11 substantive `[Spec 927]`/phase commits + porch bookkeeping).
- **Tests**: codev overview suite + dashboard `NeedsAttentionList` (13 passing) + VSCode `builders.test.ts` blast-radius suite. New: gate-authoritative `derivePrReady` cases incl. `requested_at` guard; verify-approval in `detectBlocked`/`detectBlockedSince`; verify gate-row + "missing PR ⇒ no row" + unaffiliated-uses-createdAt; VSCode verify-blocked ordering. Removed: 2 inverted + 1 merged-suppression + 1 impossible-shape + 2 `recentlyMergedIssueIds` server tests.
- **Files changed**: 8 (`packages/`): `overview.ts`, `overview.test.ts`, `types/api.ts`, `vscode/test/builders.test.ts`, `dashboard/NeedsAttentionList.tsx`, `dashboard/NeedsAttentionList.test.tsx`, `dashboard/WorkView.tsx`, `dashboard/index.css`.
- **Net LOC impact**: **−45** (+227 / −272) — a net simplification.

## Consultation Iteration Summary

18 consultation files (spec + plan + 3 impl phases, several with 3 models/round). Verdict pattern: Gemini and Claude APPROVE throughout; Codex was the consistent, valuable skeptic.

| Phase | Iters | Who Blocked | What They Caught |
|-------|-------|-------------|------------------|
| Specify | 1 | Codex (RC) | Pin shared `blocked` semantics for `pr`; define the `verify-approval` label string |
| Plan | 1 | Codex (RC) | VSCode blast radius must be *owned* in a phase (files+tests), not just discussed; align Phase-1 "+types" file list |
| server-derivation | 1 | — (Gemini infra-flaked once, retried clean) | Unanimous APPROVE |
| dashboard-surfacing | 2 | Codex (RC iter-1) | Affiliated PR `waitingSince` still fell back to `createdAt`; tests locked the impossible gateless-BUGFIX shape |
| remove-dead-projection | 1 | — | Unanimous APPROVE |

**Most frequent blocker**: Codex — focused on contract precision and removing vestigial behavior. All blocks were legitimate and accepted.

### Avoidable Iterations

1. **Carried-over tests/fallback (Phase 2)**: when a downstream phase changes an invariant (gate-authoritative `prReady` ⇒ `blockedSince` always present), the builder should proactively audit *existing* tests/fallbacks that encode the old invariant rather than leaving them for a reviewer to catch. Codex's Phase-2 RC was avoidable with a self-audit of the `pr.createdAt` fallback against the new contract.

## Consultation Feedback

### Specify (Round 1) — Codex RC, Gemini/Claude APPROVE
- **Codex**: shared `pr` semantics + `verify-approval` label undefined. **Addressed**: added the dashboard-local scope rule, the `requested_at` invariant, and the `"verify review"` label contract.
- **Builder-initiated corrections**: caught two over-broad Gemini suggestions — a bare `gates['pr']==='pending'` check (would mis-flag fresh projects) and "delete `fetchRecentMergedPRs`" (it has a second consumer). Both **rebutted with evidence** and the spec/plan reflect the correct form.

### Plan (Round 1) — Codex RC, Gemini/Claude APPROVE
- **Codex**: own the VSCode blast radius in Phase 1; align the "+types" file list. **Addressed**: Phase 1 took explicit ownership (files + acceptance criteria + tests).

### dashboard-surfacing (Round 1) — Codex RC, Gemini/Claude APPROVE
- **Codex**: affiliated PR `waitingSince` could still use `pr.createdAt`; obsolete gateless-BUGFIX tests. **Addressed**: explicit affiliated→gate-timestamp / unaffiliated→createdAt split; tests reframed/removed. **Round 2: unanimous APPROVE.**

### server-derivation / remove-dead-projection
- No substantive concerns — unanimous APPROVE (one Gemini consult infra-flaked with a tool error and was re-run).

## Lessons Learned

### What Went Well
- **The signal already existed.** Reframing the whole problem around the existing `pr` gate (rather than inventing a marker) made the change a net deletion — the most robust kind of fix.
- **Scrutinizing reviewer suggestions paid off repeatedly** — two over-confident Gemini suggestions (bad predicate, wrong helper deletion) were caught and corrected with code evidence rather than applied blindly.
- **Phase ordering kept every commit green** in both packages (consume-then-remove for `recentlyMergedIssueIds`).
- **Render-verify caught nothing broken — but proved it** (see Architecture Updates): the new `.attention-kind--verify` class renders the intended amber, not unstyled.

### Challenges Encountered
- **Worktree had no `node_modules`** (no `worktree.postSpawn`): resolved with `pnpm install --frozen-lockfile`; cost a short detour diagnosing a vitest resolution error.
- **porch check coverage gap**: the `tests` check runs only `@cluesmith/codev` tests — dashboard and VSCode tests are *not* porch-gated. Verified those manually each phase. (1 Codex iteration on Phase 2.)

### What Would Be Done Differently
- Audit pre-existing tests/fallbacks against a newly-introduced invariant *before* signaling phase-complete (would have pre-empted the Phase-2 Codex RC).

## Architecture Updates

No edits to `codev/resources/arch.md` were needed — it does not document Needs-Attention internals (`derivePrReady` / `recentlyMergedIssueIds` / gate labels) at this level, and the change *clarifies and simplifies* existing behavior rather than introducing new architectural shape. The durable contract is recorded here:

- **Needs Attention surfacing contract**: a PR surfaces iff its linked builder's `pr` gate is genuinely pending (`status: pending` **and** `requested_at`). The `pr` gate going pending is the **uniform post-CMAP "ready for human" signal** across all PR-producing protocols (BUGFIX, AIR, SPIR, ASPIR, PIR — #887 gave BUGFIX a `pr` gate). A protocol must carry a `pr` gate for its PR to surface; gateless variants don't surface PR rows, by design.
- **Dashboard-local "no builder stand-in" rule**: `pr` stays in the shared `GATE_LABELS`/`detectBlocked*` (VSCode tree/toast/status-bar depend on it and surface a pr-gate builder as a blocked builder); only the dashboard `NeedsAttentionList` enforces "PR-as-PR-row" because only it has the open-PR set.
- **`verify-approval`** now surfaces as a blocked human gate (`"verify review"`) everywhere `detectBlocked` is consumed (dashboard gate row + VSCode), via the gate-toast generic fallback.

**Render verification (per architect instruction + UI-PR policy)**: headless chromium loaded the **built** dashboard CSS with the exact `NeedsAttentionList` row DOM. The `.attention-kind--verify` span computed to `rgb(234, 179, 8)` (`--status-waiting`, == the PR row), distinct from spec (`rgb(239,68,68)`) and from an unstyled control — proving the new className actually receives styling (no "className without matching CSS" gap). Screenshot captured during review.

## Lessons Learned Updates

No edits to `codev/resources/lessons-learned.md` were made in-branch (that file is curated during MAINTAIN from review docs). Candidate lessons for the next MAINTAIN harvest:

- **Reframe to an existing signal before adding one.** The cleanest fix to an over-derived state is often to key on a signal that already exists end-to-end (here, the `pr` gate) — turning a feature into a deletion.
- **Audit existing tests/fallbacks against new invariants.** When a phase tightens an invariant, pre-existing tests encoding the looser shape become false-confidence; audit and update them proactively.
- **Scrutinize CMAP suggestions, especially confident deletions.** Verify blast radius (e.g. second consumers) before applying a reviewer's "just delete X."
- **porch `tests` is single-package.** Dashboard/VSCode tests aren't gated by porch's check; run them manually per phase when touching those packages.

## Technical Debt

- The affiliated-PR `?? pr.createdAt` is an unreachable type guard (documented). It exists because `OverviewBuilder.blockedSince` is typed `string | null` independently of `prReady`; a future type-level coupling could remove it, but it's not worth a type gymnastics now.

## Follow-up Items

- **#919** (`verified → complete` terminal-state rename): its Needs-Attention / `derivePrReady` parts are now **unnecessary** (this work supersedes them). The honesty rename of the terminal state stands on its own — recommend descoping #919 to just the rename.
- **#902 / #901** (`recentlyMergedIssueIds`): the projection is removed; #902's mechanism is retired. No further action beyond noting it in the PR.
- **External adopter (shannon)**: align its gateless bugfix variant to the pr-gated upstream so it's covered by the universal mechanism (tracked outside this repo).
- **VSCode `verify-approval` UX (for Amr / area/vscode)**: verify-approval now surfaces as a blocked builder via the generic gate-toast fallback. A dedicated `GATE_ACTIONS` "Verify" action is an optional additive follow-up — not required by #927.
- **Worktree DX**: consider adding `worktree.postSpawn: ["pnpm install --frozen-lockfile"]` to `.codev/config.json` so builder worktrees come with deps installed.
- **EXPERIMENT/MAINTAIN completion gates** (`experiment-complete`/`maintain-complete`) surface nowhere in the dashboard today — out of scope for #927; track separately if surfacing is desired.
