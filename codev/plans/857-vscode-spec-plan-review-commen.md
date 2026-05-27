# PIR Plan: VSCode review-comment polish pass

## Understanding

Issue #857 is a four-part polish bundle on the native VS Code Comments wiring for `codev/{plans,specs}/*.md` (`packages/vscode/src/comments/plan-review.ts`) plus the markdown-only `Codev: Add Review Comment` palette command (`packages/vscode/src/commands/review.ts`):

1. **Default placeholders leak through.** `vscode.comments.createCommentController(...)` is called at `plan-review.ts:41-44` without `controller.options`, so the inline reply input shows generic VS Code copy.
2. **`codev/reviews/*.md` is excluded.** `ELIGIBLE_PATH_REGEX = /\/codev\/(plans|specs)\//` at `plan-review.ts:33` blocks review files. Everything downstream (`refreshDoc`, `submitReviewComment`, `deleteReviewCommentByThread`) is path-agnostic, so the fix is a single regex extension.
3. **Author is hardcoded to `@architect`.** `plan-review.ts:144` writes `<!-- REVIEW(@architect): ${body} -->`; `commands/review.ts:22` writes `syntax.wrap('REVIEW(@architect): ')`. Wrong for multi-human workspaces.
4. **Comments-panel discoverability.** Issue asks us to verify threads aggregate into VS Code's built-in Comments panel; fix the wiring only if they don't.

Related #839 ("Codev:" prefix on submit/delete titles) is **already merged** (commit `607ce43e`, before this branch). No bundling needed.

Out of scope: replies/threading, resolve state, builder-side write convention, gate integration, `snippets/review.json` change.

## Proposed Change

### Fix 1 — Codev-specific input copy

In `activateReviewComments` (`plan-review.ts`), set `controller.options` immediately after construction:

```ts
controller.options = {
  prompt: 'Add review comment',
  placeHolder: 'Type your review comment, then Submit',
};
```

### Fix 2 — Include `codev/reviews/*.md`

Extend the regex at `plan-review.ts:33`:

```ts
const ELIGIBLE_PATH_REGEX = /\/codev\/(plans|specs|reviews)\//;
```

Nothing else changes — `isEligibleDocument`, `refreshDoc`, submit, and delete all consult this single predicate.

### Fix 3 — Author from git config (with `architect` fallback)

The issue copy says "read git config user.name once at activation". Two entry points need the value (`plan-review.ts:submitReviewComment` and `commands/review.ts:addReviewComment`), so I'll introduce a tiny shared helper module rather than reading the value in two places or threading it through both activations from `extension.ts`.

**New file: `packages/vscode/src/comments/author.ts`**

```ts
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import * as vscode from 'vscode';

const execFileAsync = promisify(execFile);
const FALLBACK = 'architect';

let cached: Promise<string> | undefined;

export function getReviewAuthor(): Promise<string> {
  if (!cached) {
    cached = resolve();
  }
  return cached;
}

async function resolve(): Promise<string> {
  const cwd = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  try {
    const { stdout } = await execFileAsync('git', ['config', 'user.name'], { cwd });
    const name = stdout.trim();
    return name.length > 0 ? name : FALLBACK;
  } catch {
    return FALLBACK;
  }
}
```

- Lazy + memoized → effectively "once at activation" without making activation itself async or blocking.
- `cwd` defaults to the first workspace folder so local-override `user.name` is honored; falls back to process cwd / global config when no folder is open.
- Failure modes (no git binary, no config, non-repo cwd) all collapse to `architect`.

Wire it into both call sites:

- `plan-review.ts:144` →
  ```ts
  const author = await getReviewAuthor();
  const commentLine = `${indent}<!-- REVIEW(@${author}): ${body} -->`;
  ```
- `commands/review.ts:22` →
  ```ts
  const author = await getReviewAuthor();
  const comment = syntax.wrap(`REVIEW(@${author}): `);
  ```

`addReviewComment` is already `async`; `submitReviewComment` is already `async` — no signature churn.

The cursor-offset math at `commands/review.ts:29` is unaffected (offset is measured from the *closing* delimiter and is independent of body length).

### Fix 4 — Comments-panel discoverability

VS Code's built-in **Comments** panel (bottom panel, `workbench.panel.comments`) auto-aggregates threads from every registered `CommentController`. The current wiring already calls `controller.createCommentThread(...)` for each parsed REVIEW marker, and `controller.commentingRangeProvider` is set — both are the prerequisites for panel inclusion per the VS Code Comments API contract.

Expectation: threads already appear in the panel; this is a verification-only fix.

If the verification at the `dev-approval` gate shows threads missing, the most likely culprits are (a) the controller needing a non-empty `label` (we pass `'Codev Plan Review'` — already correct) or (b) threads created with collapsed state being filtered (we set `Expanded` — also correct). If verification surfaces a real gap, I'll iterate on the controller wiring before opening the PR.

## Files to Change

- `packages/vscode/src/comments/plan-review.ts`
  - line 33 → extend regex to include `reviews`
  - lines 41-44 → add `controller.options` block after `createCommentController`
  - line 144 → swap hardcoded `@architect` for `await getReviewAuthor()`
  - new import for `getReviewAuthor`
- `packages/vscode/src/commands/review.ts`
  - line 22 → swap hardcoded `@architect` for `await getReviewAuthor()`
  - new import for `getReviewAuthor`
- `packages/vscode/src/comments/author.ts` — new file, ~25 lines, helper module described above
- *(no change)* `packages/vscode/snippets/review.json` — snippets can't expand shell commands; `@architect` stays as the template default per the issue's explicit instruction
- *(no change)* `packages/vscode/package.json` — #839 already shipped the `Codev:` prefix

No test file changes planned — the VS Code package's existing test harness covers extension activation; the changes here are user-facing wiring best validated at the `dev-approval` gate by exercising the inline comment flow against a real worktree.

## Risks & Alternatives Considered

- **Risk: git binary missing or `user.name` unset on a fresh machine.** Mitigated by `try`/`catch` + `FALLBACK = 'architect'`. The user sees the exact same string as before; nothing breaks.
- **Risk: `cwd` selection picks the wrong workspace folder.** Multi-root workspaces fall back to `workspaceFolders[0]`. In a Codev install the codev/ checkout is the primary root, and `git config user.name` is almost always set globally, not per-repo, so the cwd choice rarely matters. Documenting it inline in the helper for future readers.
- **Risk: cached author goes stale if the user changes `git config user.name` mid-session.** Acceptable. The issue explicitly asks for "once at activation" semantics, and a VS Code reload picks up the new value. Not worth a file-watcher.
- **Alternative considered: read author at `extension.ts` activation and pass it through to `activateReviewComments(context, author)` + a closure-captured `addReviewComment(author)`.** Rejected — pushes async resolution into the activation path and requires changes in three files instead of two; the lazy-memo helper achieves the same observable behavior with smaller blast radius.
- **Alternative considered: inline `execFile` at each call site.** Rejected — duplicates the fallback / parse logic and runs the subprocess twice per session.
- **Back-compat:** existing `<!-- REVIEW(@architect): ... -->` markers in committed files keep rendering — `REVIEW_COMMENT_PATTERN` already captures any `@([^)]+)`, not just `@architect`.

## Test Plan

The reviewer will exercise this at the `dev-approval` gate (`afx dev pir-857` against this worktree).

### Build + unit
- `pnpm --filter @cluesmith/codev-vscode build` (or repo-root `pnpm build`) must succeed.
- `pnpm --filter @cluesmith/codev-vscode test` must pass.

### Manual — inline comments (Fix 1, 2)
1. Open any `codev/plans/*.md` file in the worktree → hover a line → confirm the `+` appears.
2. Click `+` → confirm the reply input shows **"Type your review comment, then Submit"** (Fix 1), not VS Code's default.
3. Type a comment → Submit → confirm a `<!-- REVIEW(@<your-git-name>): ... -->` marker is written on the next line (Fix 3 — author should be your real git identity, not `architect`, unless your git is unconfigured).
4. Repeat (1)-(3) against a `codev/specs/*.md` file → same behavior.
5. **New for Fix 2**: repeat (1)-(3) against a `codev/reviews/*.md` file (e.g. any committed review under `codev/reviews/`) → confirm `+` appears and submitted comment lands inline.

### Manual — palette command (Fix 3, second call site)
6. Open any markdown file → cmd+shift+P → "Codev: Add Review Comment" → confirm the inserted comment uses your git name as author.

### Manual — back-compat (Fix 3 regression check)
7. Open a file that already contains `<!-- REVIEW(@architect): ... -->` markers (any committed plan with prior review comments) → confirm threads render as collapsed comment UI exactly as before (the regex matches any `@<name>`).

### Manual — delete flow (regression check)
8. Hover an inline-rendered review thread → click trash icon → confirm the REVIEW line is removed from the file.

### Manual — Comments panel (Fix 4 verification)
9. Open the **Comments** panel (View → Open View → Comments, or `workbench.panel.comments`).
10. Open a plan/spec/review file containing REVIEW markers → confirm the threads appear in the Comments panel grouped under "Codev Plan Review".
11. If they don't appear, surface findings at the `dev-approval` gate so we can decide whether to iterate or accept the no-op finding (documented in the review file's "Comments panel aggregation" note).

### Cross-platform
None — VS Code extension, behaves identically across OS for these changes. The `execFile('git', ...)` subprocess respects PATH on macOS / Linux / Windows.
