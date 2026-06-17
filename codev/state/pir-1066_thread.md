# PIR #1066 — sync Builders sidebar selection with active builder-diff file

## Phase: plan

### Investigation (done)
Issue: when the active builder-diff editor changes (keyboard nav #1060, multi-file
View Diff click, per-file diff), the Builders sidebar keeps the last-clicked row
highlighted instead of following the editor. Want an Explorer-style "reveal active
file" sync.

Key code map:
- `diff-inject-codelens.ts` — registry keyed by right-side fsPath →
  `{ builderId, relPath, hunks }`. `getDiffInjectEntry(fsPath)` is the resolver.
  Already has an `onDidChangeActiveTextEditor` listener (for the context key).
- `views/builders.ts` — `BuildersProvider`. `getParent` is **builder-row-only**
  today (returns group for `BuilderTreeItem`, undefined for file/folder rows).
  `rowIds` (AccordionRowIds, #913) versions builder-row ids. `groupParentByBuilderId`
  maps builder→group, populated in `rootChildren`.
- `views/builder-file-tree-item.ts` — `BuilderFileTreeItem` has **NO `id`** today.
- `views/builder-folder-tree-item.ts` — folder rows already have stable id
  `<builderId>::folder::<fullPath>`.
- `views/file-path-tree.ts` — `buildFilePathTree` builds the compacted folder tree
  (tree mode). Leaf node `fullPath === plan.resourcePath`.
- `extension.ts` — `buildersView = createTreeView(...)` (so `reveal` is available).
  Accordion wired via `onDidExpandElement` → `collapseBuildersExcept`.
  `openBuilderRow` already does `buildersView.reveal(item, {expand:true})` — proven
  that reveal(expand) fires onDidExpandElement and the accordion handles it.

### Plan approach (4 parts)
1. Stable id on `BuilderFileTreeItem`: `<builderId>::<relPath>` (reveal matches by id).
2. Extend `getParent` to reconstruct the chain for file + folder rows
   (flat mode → builder row; tree mode → rebuild path tree, find parent folder).
3. `findFileItem(builderId, relPath)` on the provider to construct the matching item.
4. `onDidChangeActiveTextEditor` listener in extension.ts: resolve via
   `getDiffInjectEntry`, gate on a new `codev.buildersAutoReveal` setting
   (default true), `reveal(item, {select:true, expand:true, focus:false})`.

dev-approval gate is load-bearing: walk all modes (flat/tree × stage/area) on the
running tree.

Plan written → awaiting plan-approval gate.
