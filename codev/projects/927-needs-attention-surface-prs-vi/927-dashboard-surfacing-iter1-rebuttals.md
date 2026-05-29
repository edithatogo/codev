# Phase 2 (dashboard-surfacing) — Rebuttal to iteration-1 consultation

**Verdicts**: Gemini APPROVE · Claude APPROVE · Codex REQUEST_CHANGES (HIGH).

Codex's REQUEST_CHANGES is **correct and accepted** — I made the changes. It caught that Phase 2 carried over a fallback path and two tests that encode the **old gateless-BUGFIX shape** (`prReady: true` with no gate / no `blockedSince`), which is *impossible* under the gate-authoritative model delivered in Phase 1 (where `prReady === true` ⟺ `pr` gate `pending` ⟹ `blockedSince` present). They contradicted the spec's waiting-time contract.

---

## Codex KEY_ISSUES

### C1 — `waitingSince: readySince || pr.createdAt` for affiliated PRs (NeedsAttentionList.tsx)
**Accepted; fixed.** The spec says the `pr.createdAt` fallback remains **only** for unaffiliated/human PRs; affiliated (linked) PRs use the builder's gate-requested time (`blockedSince`). I restructured the PR-loop to make this explicit:

```ts
const waitingSince = prReady ? (readySince ?? pr.createdAt) : pr.createdAt;
```

- **Affiliated** (`prReady`): uses `readySince` (= the builder's `blockedSince` = `pr` gate `requested_at`). Under the gate-authoritative model a `prReady` builder always carries `blockedSince`, so `readySince` is always present; the `?? pr.createdAt` is now an **unreachable type guard** (documented as such in a comment), *not* the old gateless-BUGFIX createdAt fallback.
- **Unaffiliated / human** PR: uses `pr.createdAt` (no gate signal) — the only place that fallback legitimately lives.

I kept the `?? pr.createdAt` type guard rather than a non-null assertion / omission because (a) `readySince` is typed `string | undefined` and (b) silently dropping or crashing the whole Needs Attention list on a transiently-malformed builder record is worse than a fail-soft presentational default. With the obsolete tests removed (C2), nothing claims that guard is load-bearing for affiliated PRs.

### C2 — Tests at :86–105 and :160–180 codify the removed gateless-BUGFIX shape
**Accepted; fixed.**
- **`:86–105`** ("surfaces a BUGFIX PR whose builder has no gate (Issue #872)") → **reframed** to the post-#887 gate-authoritative shape: the BUGFIX builder now carries `blocked: 'PR review'`, `blockedGate: 'pr'`, `blockedSince` set, `prReady: true`. The test now also asserts `waitingSince === blockedSince` (gate-requested time, not `createdAt`), locking the new invariant.
- **`:160–180`** ("falls back to pr.createdAt for a prReady builder without blockedSince (BUGFIX shape)") → **removed**. It tested a state that can no longer occur under gate-authoritative `derivePrReady`. The affiliated-uses-`blockedSince` invariant is covered by the existing ":145–158" test and the reframed ":86–105".
- **Bonus**: strengthened the unaffiliated/human-PR test to assert `waitingSince === pr.createdAt`, explicitly locking the *only* legitimate `createdAt` path.

Dashboard tests: **13 passed** (was 14; −1 obsolete test removed).

---

## Gemini APPROVE / Claude APPROVE
No issues. Both confirmed the builder-emit deletion, the `if (b.prReady) continue;` exclusion, the verify styling, and the `recentlyMergedIssueIds` prop removal match the plan.

---

## Net
Codex's catch tightened the gate-authoritative contract: affiliated PR wait time now flows exclusively from the `pr` gate timestamp (createdAt reserved for unaffiliated PRs), and the test suite no longer encodes the impossible gateless-BUGFIX shape. Build + dashboard tests green.
