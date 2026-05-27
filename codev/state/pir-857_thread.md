# PIR #857 — VSCode review-comment polish pass

## 2026-05-27 — Plan phase

Investigated the issue and the three files cited (`plan-review.ts`, `commands/review.ts`, `snippets/review.json`). Confirmed:

- Related #839 ("Codev:" prefix) is already shipped (commit `607ce43e`); no bundling needed.
- All four gaps are well-scoped and decoupled.

**Design decision for Fix 3 (author from git)**: introduced a new shared helper `packages/vscode/src/comments/author.ts` with a lazy-memoized `getReviewAuthor()` rather than threading the value through `extension.ts` activation. Two call sites, both already `async` — single source of truth, no activation-path async churn, falls back to `architect` on any failure.

Plan committed and awaiting `plan-approval`.
