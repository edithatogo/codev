# bugfix-901 — Needs Attention surfaces post-merge builders

## Investigation

Issue #901: After PR merge, builder still surfaces under Needs Attention with stale `prReady: true`. Two interacting problems documented in the issue:

1. **Data hazard** (already fixed by #888): v3.1.4 re-set `pr_ready_for_human=true` on terminal `pr→verified` advance. In-flight builders that crossed that boundary still carry the stale `true` in status.yaml. Self-corrects for new builders.
2. **Consumer-side gap** (this fix): `NeedsAttentionList.buildItems` (packages/dashboard/src/components/NeedsAttentionList.tsx:108) defensive fallback emits a row for any `b.prReady === true` builder whose PR isn't in `prs[]`. The intent was cache-miss defense (PR #874 iter-2). But merged PRs are also absent from `prs[]` (which lists open PRs only) — the same code path fires wrongly.

The data we need is already fetched: `overview.ts:911` calls `fetchMergedPRsCached(workspaceRoot)` and uses the result internally to enrich `recentlyClosed[]` with `prUrl`. It just isn't exposed on `OverviewData` for `NeedsAttentionList` to cross-reference.

## Approach

Minimal fix:

1. Add `recentlyMergedIssueIds: string[]` to `OverviewData` (`packages/types/src/api.ts`). Just the issue-ID set — that's all the consumer needs.
2. Populate it in `overview.ts` from the already-fetched `mergedPRs` via `parseLinkedIssue`.
3. Plumb through `NeedsAttentionList`'s `buildItems` signature and use it to gate the defensive fallback emit.
4. Update tests: regression test + clarify the defensive test's setup.

PR-loop is untouched — it iterates open PRs only, so already correct.

## Implementation notes

- The codev package defines its OWN `OverviewData` interface (`packages/codev/src/agent-farm/servers/overview.ts:156`) in addition to the shared one in `packages/types/src/api.ts`. Both needed updating — otherwise the local tsc check fails with `Object literal may only specify known properties` even though the wire type is correct. Worth noting if anyone wonders why the change touches two type declarations.
- The merged-PR projection runs unconditionally even when `closed === null` (the existing recentlyClosed block early-outs). This is intentional — the consumer needs the merged-issue set independent of whether the closed-issue enrichment succeeded.
- `recentlyMergedIssueIds: readonly string[]` in the React prop with a default of `[]` so the change is backwards-compatible for any tests/callers that don't (yet) pass it.

## PR

PR #902 opened. CMAP-3 (gemini/codex/claude) ran in parallel via consult.

## CMAP-3 result

All three: **APPROVE / HIGH / no key issues**. Iter-1 outputs persisted at
`codev/projects/bugfix-901-needs-attention-surfaces-build/bugfix-901-pr-iter1-{gemini,codex,claude}.txt`.
Claude flagged a non-blocking style nit (two existing `buildItems(prs, builders)`
test calls rely on the new default param instead of passing `[]` explicitly) —
left as-is. PR body updated with the verdict table.

Notifying architect + running `porch done bugfix-901` to request the pr gate.
