# PIR #907 — builder flashes into UNCATEGORIZED during cleanup

## Plan phase (2026-06-06)

Investigated the area-grouping / cleanup data flow.

**Key findings:**
- `area` is derived server-side per overview build in `OverviewCache.getOverview`, defaulting to `UNCATEGORIZED_AREA` and enriched from the **open-issues** cache (`overview.ts:880-888`).
- `gh issue list` (the `issue-list` concept) is **open-only** by default — a closed issue silently drops out of `issueAreaMap`, so the `if (area)` guard fails and the record keeps the `Uncategorized` default.
- The mis-classification only becomes visible while the builder still passes the **active-session filter** (`overview.ts:796-799`); cleanup kills the terminal first but the registry/SSE refresh lags → the observed 2-5s window.
- `OverviewCache` is a process-lifetime singleton (`tower-routes.ts:100`), so per-builder memo state persists across refreshes; `invalidate()` only clears fetch caches.

**Chosen fix:** last-known-good `area` memoization in `OverviewCache` (Map keyed by `worktreePath`). Fall back to the last resolved area only when the issue is absent / fetch failed; write-through only on resolve, so genuine no-area builders still classify as `Uncategorized`. Robust to all three candidate sub-triggers (issue closed / metadata torn down / `issues === null`). No wire-field change, no cross-process plumbing.

Acceptance criterion #1 (reproduction with logging) deferred to implement phase: temporary debug logging will confirm which sub-trigger fires before the targeted fix lands.

Plan written to `codev/plans/907-vscode-builder-briefly-appears.md`. Awaiting `plan-approval`.
