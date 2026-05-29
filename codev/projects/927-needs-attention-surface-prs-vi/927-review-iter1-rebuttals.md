# PR-level CMAP (review phase) — Rebuttal to iteration-1

**Verdicts**: Gemini APPROVE · Claude APPROVE · Codex REQUEST_CHANGES (HIGH).

## Codex KEY_ISSUES

### C1 — spec/plan missing `approved`/`validated` frontmatter (Status: draft)
**Accepted; fixed.** Per the SPIR protocol's final-approval steps (Specify §12 / Plan §11) and the repo's CLAUDE.md policy, an approved spec/plan must carry YAML frontmatter. Both gates were human-approved (spec-approval 2026-05-29, plan-approval 2026-05-29), but I left the artifacts as `Status: draft` with no frontmatter — a genuine miss. Fixed:

- `codev/specs/927-…md` and `codev/plans/927-…md` now start with:
  ```yaml
  ---
  approved: 2026-05-29
  validated: [gemini, codex, claude]
  ---
  ```
  and `## Metadata → Status` flipped `draft → approved`.

### C2 — `gateKindClass` has `code review` instead of `dev review` (dev-approval rows fall back to `--plan` styling)
**Rebutted — explicitly out of scope by architect decision.** This pre-existing styling gap was raised in the plan as a *flagged optional drive-by*, and the **architect ruled it OUT of scope at the plan-approval gate** (verbatim: "leave the optional 'dev review' gateKindClass styling drive-by OUT of scope (confirmed) — not part of #927; can be filed separately"). Codex correctly notes it is "not a correctness bug for #927." It is unrelated to the `pr`-gate surfacing work, predates this PR, and touching it would be scope creep against an explicit human decision.

**Tracked as a follow-up** (Review doc → Follow-up Items): file a separate issue to add `case 'dev review': return 'attention-kind--dev'` + CSS. Not addressed here by design.

## Gemini / Claude
APPROVE, no issues.

## Net
C1 fixed (approval frontmatter added to spec + plan). C2 rebutted on the basis of the architect's explicit plan-approval decision; tracked as a separate follow-up. No code changes to the #927 surfacing logic.
