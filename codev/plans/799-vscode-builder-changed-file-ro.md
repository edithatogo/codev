# PIR Plan: Builder changed-file rows render grey instead of SCM colors (#799)

## Understanding

Builder changed-file rows in the VSCode Builders view (list and tree mode) render
their filenames in grey instead of SCM colors — Added should be green, Modified
yellow, Deleted red. The `A`/`M`/`D` status badge on the right stays correct;
only the label *color* is wrong.

**Critical context the issue body did not have: the issue's own "proposed fix"
was already implemented and shipped, and it did not work.**

- Commit `0301b7fa "Fix #799: use custom scheme for builder changed-file
  resourceUri"` switched `builderFileResourceUri` to the custom
  `codev-builder-diff:` scheme (`builder-file-tree-item.ts:43-45`), shipped in
  v3.1.4.
- The architect **reopened** the issue on 2026-05-29, confirming via fresh
  screenshot that rows are **still grey** — the fix is in the bundled code but the
  behavior is unchanged.

### The decisive symptom

The reviewer reports that the correct colors render **for a split second, then are
instantly overridden by grey**. That flicker is the whole diagnosis: it rules out
a static wrong-color (the SCM color tokens clearly *do* resolve to visible
green/yellow/red) and points squarely at a **late-arriving grey decoration winning
a re-merge** after the first paint.

### Root cause (high confidence, VSCode-source-backed)

The shipped fix's premise — *"the built-in Git decorator only acts on
`scheme === 'file'`, so the custom scheme stops it from firing"* — **is false.**

Verified against `microsoft/vscode` source:

1. **Git's decorators do not check `uri.scheme`.** In
   `extensions/git/src/decorationProvider.ts`, `GitDecorationProvider` is a pure
   `this.decorations.get(uri.toString())` lookup, and `GitIgnoreDecorationProvider`
   does `getRepository(uri)` (path-based) then `repository.checkIgnore(paths)`
   (shells out to `git check-ignore` on the URI's path) — **neither inspects the
   scheme.** Our `codev-builder-diff:` URI is built as
   `vscode.Uri.file(path.join(worktreePath, rel)).with({ scheme })`, so its
   `.path`/`.fsPath` still point at the real, gitignored `.builders/<id>/…` file.
   Git resolves the repo by that path and `git check-ignore` matches → Git emits
   its grey `gitDecoration.ignoredResourceForeground` decoration on our row.

2. **Extensions cannot outrank Git in the merge.**
   `src/vs/workbench/api/browser/mainThreadDecorations.ts` pins *every*
   extension-provided decoration (Git's and ours) to a hardcoded `weight: 10`. In
   `src/vs/workbench/services/decorations/browser/decorationsService.ts` the merge
   sorts by weight desc (a no-op tie at equal weight) and takes
   `data.find(d => !!d.color) ?? data[0]` — the **first colored entry in
   non-deterministic registration/merge order**.

3. **Timing produces the flicker.** Our decoration resolves synchronously (cache
   lookup) and paints first → correct color. Git's `GitIgnoreDecorationProvider`
   resolves on a **500 ms debounce**, then fires a decoration-change that triggers
   a re-merge; when Git's equal-weight grey lands first in the merge order, it
   wins → grey. This is the open, unresolved VSCode issue
   [#187756](https://github.com/microsoft/vscode/issues/187756) ("FileDecoration
   color overrides gitDecoration color … all decoration providers have the same
   weight").

So the scheme swap was orthogonal to the actual mechanism. There is **no API to
set decoration weight or to suppress another extension's provider**. The only
lever an extension controls is the **URI shape**: if the URI's path does not
resolve to a real tracked/ignored file inside an open repo, `getRepository(uri)`
returns undefined, Git's provider returns nothing, and ours becomes the sole
colored decoration — winning by default.

### Why the prior unit tests passed while the bug shipped

`builder-file-tree-item.test.ts` asserts only that the scheme is non-`file`. It
never asserts the URI path is un-resolvable by Git, and cannot observe rendering.
It passed while the bug shipped — and would still pass against the broken code.

## Proposed Change

Keep the `codev-builder-diff:` scheme, but **stop deriving the URI from the real
worktree filesystem path.** Build a synthetic path that (a) Git cannot resolve to
a repo-tracked/ignored file, while (b) still ending in the real basename so the
file-type icon resolves, and (c) carrying the real worktree path in the query so
our own decoration provider and command handlers can recover it.

### The change

In `builder-file-tree-item.ts`, change `builderFileResourceUri`:

```ts
export function builderFileResourceUri(worktreePath: string, rel: string): vscode.Uri {
  // Synthetic path ('/' + rel), NOT the real worktree fsPath. The built-in Git
  // decorators resolve a repository by PATH and run `git check-ignore` on it
  // (scheme-agnostic) — with the real `.builders/<id>/…` path they fire their
  // grey "ignored" decoration and, at equal weight, win the color merge on a
  // 500ms debounce (#799, vscode#187756). A path that doesn't resolve into any
  // open repo makes Git's getRepository() return undefined, so it never fires
  // and our SCM color is the sole (winning) decoration. The basename at the tail
  // still drives the file-type icon; the real worktree path rides in the query
  // for our provider/handlers to read back.
  return vscode.Uri.from({
    scheme: BUILDER_FILE_SCHEME,
    path: '/' + rel,
    query: `wt=${encodeURIComponent(worktreePath)}`,
  });
}
```

Why this satisfies every constraint:

- **Git no longer fires.** `/src/components/Foo.tsx` does not start with any open
  repo root (the workspace repo root is an absolute path like
  `/Users/…/codev`), so `getRepository(uri)` → undefined and `checkIgnore` is
  never called. `GitDecorationProvider` also returns undefined (it has no entry
  keyed by this URI's `toString()`). Git contributes nothing → our decoration
  wins. No flicker.
- **Uniqueness across builders is preserved.** Two builders can share the same
  `rel`; the `wt=<worktree>` query keeps `uri.toString()` distinct per builder, so
  the per-builder decoration cache (keyed by `uri.toString()`) does not collide.
  This is the role the full worktree path played in the old `file:`-based URI.
- **The file-type icon still resolves** — `IFileIconTheme` keys off the last path
  segment (the real basename), which is unchanged.
- **The cache and the tree item stay in lockstep** — both call this one helper, so
  their URIs match exactly (`builder-diff-cache.ts:107` and
  `builder-file-tree-item.ts:78`). No cache/keying changes needed; the map already
  keys by `uri.toString()`.

### What this drops vs. the medium-confidence draft

The earlier draft proposed registering own `contributes.colors` because the
leading hypothesis was a grey *color value*. The flicker disproves that (the
colors render correctly before being overridden), so **`contributes.colors` is
not part of this fix** — the borrowed `gitDecoration.*` tokens resolve fine.

### Coloring stays automatic — no per-row work, no new colors

This fix does **not** introduce manual per-row coloring or any new color
definitions. `BuilderFileDecorationProvider.provideFileDecoration`
(`builder-file-decoration.ts:35-46`) already colors every row automatically:
VSCode queries it per URI, it looks up the status from the cache and returns the
matching `gitDecoration.*ResourceForeground` ThemeColor. That provider is
unchanged. Those theme-color *tokens* are registered by the built-in Git
extension at activation and resolve from the active theme **regardless of whether
Git's decorator fires on any given URI** (token definition ≠ decorator) — the
flicker already proves they render. The synthetic-path change only stops Git's
*competing* grey decoration; it does not change where our color comes from.

### What this does NOT touch (already correct)

- The decoration provider — `provideFileDecoration` and the `DECO` color map are
  unchanged; coloring remains automatic per status.
- Provider registration — one `registerFileDecorationProvider` at
  `extension.ts:267`; no competing Codev provider.
- Cache keying — `decorationFor`/`syncDecorations` key by `uri.toString()` via the
  shared helper (`builder-diff-cache.ts:56,103,108`).
- The diff command — `codev.openBuilderFileDiff` receives the `BuilderFileTreeItem`
  itself (`arguments: [this]`) and builds diff URIs from `worktreePath`/`baseRef`/
  `plan`, never from `resourceUri`. Unaffected by the synthetic path.

## Files to Change

- `packages/vscode/src/views/builder-file-tree-item.ts:43-45` — rewrite
  `builderFileResourceUri` to build a synthetic-path URI (worktree in the query),
  per above. Update the surrounding doc comment (lines 20-34, 75-78) to describe
  the path-resolution mechanism, not the (false) scheme-gating one.
- `packages/vscode/src/views/builder-diff-cache.ts` — **no logic change** (it uses
  the helper); only verify the comment at `:96-100` still reads correctly.
- `packages/vscode/src/test/builder-file-tree-item.test.ts` — replace the
  shape-only assertions with ones that would actually catch this class of bug
  (see Test Plan).
- `packages/vscode/package.json` — verify whether the `builder-file` contextValue
  exposes any built-in fsPath-based menu items (see Risks); add a CHANGELOG/version
  bump **only after** live confirmation. The VSCode CHANGELOG entry goes in the
  path used for this repo's extension changelog.

## Risks & Alternatives Considered

- **Risk: `resourceUri.fsPath` is now synthetic, so any built-in command that
  reveals/copies the file path (`revealFileInOS`, `copyFilePath`) would point at
  the fake path.** Must verify during implement whether the `builder-file`
  contextValue actually contributes such items. If it does: either remove them for
  this row type, or back them with a small custom command that reads the real path
  from `wt=` (query) + the rel (path) and calls the underlying action. The custom
  diff command is unaffected (it uses the item, not the URI). The original issue
  already flagged this scheme-vs-fsPath trade-off as acceptable.
- **Risk: a synthetic path accidentally resolves into a repo** (e.g. if a repo were
  rooted at `/`). Not possible in practice — repo roots are absolute workspace
  paths; `/src/...` never matches. The live diagnostic confirms Git no longer
  fires.
- **Alternative: register own `contributes.colors` / saturated tokens.** Rejected
  as the fix — the flicker proves the color value is fine; it would not stop Git's
  grey from winning the merge.
- **Alternative: revert to the `file:` scheme.** Rejected — same root cause
  (Git path-resolves it), plus it re-introduces nothing useful.
- **Alternative: try to outrank Git via decoration weight.** Impossible — the
  extension `FileDecoration` API exposes no weight; `mainThreadDecorations` pins
  all extensions to `weight: 10` (vscode#187756, unresolved).
- **Alternative (fallback if synthetic path somehow still flickers): a colored
  `ThemeIcon`/`iconPath` status glyph instead of a label tint** — rendered through
  a path that doesn't participate in the FileDecoration merge at all. Loses the
  SCM-label look; only if the URI-shape fix is somehow insufficient.

## Test Plan

The `dev-approval` gate is the real verification — unit tests cannot render labels
or run the decoration merge.

### Live confirmation of the root cause (cheap, do first)

Already strongly indicated by the flicker, but to nail it before/at the gate:
**disable the built-in Git extension** (Extensions → Git → Disable) and reload with
the *current* (broken) build. If the rows then render the correct colors with no
flicker, Git is confirmed as the overrider → the URI-shape fix is the right lever.

### Manual (at the dev-approval gate — the killer move)

1. `pnpm --filter @cluesmith/codev compile` in the worktree.
2. Launch the Extension Development Host (F5 "Run Extension", or install the built
   `.vsix`) on a workspace with at least one spawned builder worktree containing
   Added, Modified, and Deleted files.
3. Developer: Reload Window. Expand a builder row. Confirm in **both list and tree
   mode**, with the Git extension **enabled**:
   - Added is green, Modified yellow, Deleted red — and the color is **stable** (no
     flash-then-grey).
   - Badges still correct.
   - Repeat across light, dark, and high-contrast themes.
4. Confirm the per-file diff still opens (click a row) and the right-click menu
   behaves (per the fsPath risk above).

### Unit / regression (guards that would actually catch this class of bug)

- Assert the URI path is **not Git-resolvable**: `uri.path` must not contain the
  worktree absolute path; the real worktree path must be recoverable from the
  query (`wt=`). This is the assertion that would have caught the shipped bug,
  which the old scheme-only test missed.
- Assert **uniqueness**: two builders with the same `rel` produce distinct
  `uri.toString()` (so the decoration cache doesn't collide).
- Keep: scheme is `BUILDER_FILE_SCHEME` (non-`file`); basename is preserved at the
  path tail (icon resolution).
- Assert the decoration **content**: `provideFileDecoration` returns a defined
  `color` + badge per status (cheap guard against a future regression dropping the
  color).

### Optional (rendering-layer smoke)

If feasible per `codev/resources/testing-guide.md`, a VSCode integration test that
launches against a fixture worktree and asserts the changed-file row's computed
label color is the status color, not the default/ignored grey — the only layer
that can observe the merge outcome.
