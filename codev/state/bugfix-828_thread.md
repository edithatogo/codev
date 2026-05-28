# bugfix-828 — strict-mode locator collision

## Investigate

Issue #828: scheduled Dashboard E2E failed because `.work-section:has-text("Recently Closed")` matched **two** sections — the actual Recently Closed section *and* the Backlog section, which renders issue #813 ("vscode: migrate Recently Closed view from sidebar to Codev panel tab") as a row whose title contains the substring "Recently Closed".

`:has-text()` does substring-match across the whole subtree, so any backlog item whose title contains a section heading literal poisons the selector.

Four occurrences of the loose pattern, all in `packages/codev/src/agent-farm/__tests__/e2e/work-view-backlog.test.ts`:

- L77 `Backlog`
- L116 `Backlog`
- L152 `Recently Closed`
- L173 `Recently Closed`

`Backlog` is also vulnerable — any future issue whose title contains "Backlog" would break L77/L116 the same way.

`grep -rn ':has-text' packages/codev/src/agent-farm/__tests__/e2e/` shows no other `.work-section:has-text` matches — the rest of the `:has-text` usage is on tab buttons and `.instance a`, which aren't vulnerable to the same collision.

## Plan

Replace all four with the heading-scoped form:

```ts
page.locator('.work-section:has(h3.work-section-title:text-is("Backlog"))')
```

`:text-is()` matches the exact text content of the heading, not a substring of the section subtree.

## Implement

(in progress)
