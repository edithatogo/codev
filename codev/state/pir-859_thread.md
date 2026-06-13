# PIR #859 — markdown preview review comments

## Plan phase (2026-05-31)

Investigated the issue. **Core finding: the issue's stated mechanism is infeasible.**

The issue proposes injecting a script via `contributes.markdown.previewScripts` that
`postMessage`s back to the extension host. VS Code's built-in markdown preview does
**not** support preview→host messaging for contributed scripts:

- The built-in preview already calls `acquireVsCodeApi()` once (only one call allowed
  per webview), and does not expose the handle. A contributed script's second call throws.
- The host-side `onDidReceiveMessage` accepts only a fixed allowlist (`didClick`,
  `openLink`, `revealLine`, `cacheImageSizes`, …) with no passthrough — custom message
  types are dropped.
- `command:` URIs are blocked in the built-in preview (no `enableCommandUris`, no API to set it).
- The proposed first-class messaging API was filed and **closed out-of-scope**
  (microsoft/vscode#174080); related #122961 (as-designed), #84886 (out-of-scope).

So the `previewScripts` + `previewStyles` + `markdownItPlugins` approach in the issue body
cannot deliver "click + in the preview → host opens an InputBox".

**Recommended path (in plan):** Option A — a custom Codev webview that renders the eligible
markdown itself (via `markdown-it` + a small `data-line` source-map plugin), so we own the
single `acquireVsCodeApi()` and get real `postMessage` back to the host. Framed as an
optional CustomTextEditor ("Reopen With → Codev Review Preview"). The `writeReviewMarkerAt`
refactor from `plan-review.ts` is still valid and shared between editor + preview paths.

**Caveats flagged for architect at plan gate:** this is the extension's first webview, adds
`markdown-it`, and the affordance lives on a *separate* Codev preview (not the built-in
`Cmd+K V`). Materially larger than the issue advertised ("three contribution points"). Also
offered cheaper alternatives (defer/close; editor-side bridge) for the architect to choose.

Notified architect of the premise break. Plan committed, sitting at plan-approval gate.

## HOLD at plan-approval (2026-05-30, architect instruction)

Architect put #859 on hold at the plan-approval gate. Reframe in progress: the Codev
preview will be extracted as a **reusable cross-surface package** (consumable from vscode +
dashboard + future mobile) rather than a vscode-only webview. A new issue is being filed to
track the package. Once it ships, #859 will be re-planned against that foundation.

My investigation is preserved and will inform the package work: infeasibility finding
(no preview->host messaging on the built-in preview), markdown-it + data-line source-map
choice, CustomTextEditor pattern.

Action: NOT proceeding, NOT touching the plan, NOT re-planning. Sitting at the gate awaiting
the architect's signal to re-plan.

## Rebased on main + requirements check vs artifact-canvas (2026-05-31)

Rebased builder/pir-859 onto origin/main (886 commits; spir-945 / PR #1027 landed
`@cluesmith/codev-artifact-canvas@3.1.9`). Branch rebased LOCALLY only — not force-pushed
(awaiting explicit ok before rewriting the pushed branch history).

Package contract (verified by reading src):
- React lib (peer react ^18||^19). Owns: sanitized markdown render (markdown-it html:false +
  DOMPurify), 0-based `data-line` on block START tokens (token.map[0]), hover/keyboard `+`
  overlay, minimal marker display, adapter-driven data flow.
- `<ArtifactCanvas uri fileAdapter markerAdapter themeAdapter onAddComment onError? refreshKey?>`.
  Emits `onAddComment(line)` INTENT only — never calls MarkerAdapter.add itself (spec D6).
- 3 host adapters (impl in host): FileAdapter{read,watch}, MarkerAdapter{list,add},
  ThemeAdapter{resolve,onChange} (D4 Model A — off v1 render path; CSS-var theming).
- Not npm-published; consumed `workspace:*`, bundled by each host.

What #859 (vscode host) must build — reshaped from the original plan:
1. React in a vscode webview (extension has ZERO webviews today). Second esbuild bundle
   (browser/JSX, react+react-dom+package bundled, package CSS) → mount <ArtifactCanvas>.
2. CustomTextEditor ("Codev Review Preview") binds the doc; "Reopen With" + title button; path-gated
   to codev/(plans|specs|reviews)/*.md.
3. Webview<->host bridge: adapters run in webview but TextDocument/WorkspaceEdit/InputBox run in the
   extension host. Pattern: host reads doc + parses markers, pushes content+markers to webview;
   webview FileAdapter.read returns injected content, watch driven by host postMessage (or refreshKey);
   onAddComment(line) -> postMessage host -> showInputBox -> MarkerAdapter.add (host) -> doc change ->
   host re-reads + re-pushes. This message protocol IS the core of #859.
4. Reuse the still-valid `writeReviewMarkerAt` extraction from plan-review.ts for the host add();
   author = overviewCache.currentUser ?? 'architect'. CSP/nonce. Theme: bind .codev-artifact-canvas
   --codev-canvas-* to --vscode-*.

KEY DECISION to resolve in re-plan: line round-trip. Package emits 0-based block START line
(data-line = token.map[0]) and renders a marker on the block whose data-line === marker.line. The
editor convention writes the marker on the line AFTER the anchor; REVIEW HTML comments are invisible
under html:false (no data-line). So host MarkerAdapter.add/list must agree on a serialization where
list() recovers a line equal to the target block's START data-line, else markers mis-anchor on
multi-line blocks. One on-disk convention must serve BOTH the editor Comments-API path and the canvas
list()/add() path.

BONUS scope note: the package already does minimal marker display, so existing REVIEW markers will
surface in the canvas for free — the issue's "v1 authoring only, no thread rendering" non-goal is
partially delivered by the package.

Next: awaiting architect go-ahead to rewrite the plan file (re-plan) against this foundation.

## Re-plan against artifact-canvas (2026-06-13)

Rewrote codev/plans/859-...md. Scope locked by architect: VSCode-only; marker codec in
@cluesmith/codev-core (both vscode + dashboard depend on core → web host inherits it);
existing on-disk marker convention PRESERVED.

Design: vscode host = CustomTextEditor "Codev Review Preview" mounting React <ArtifactCanvas>
in our own webview (2nd esbuild browser bundle), adapters bridged webview<->extension host.
New core module `@cluesmith/codev-core/review-markers` = single home for serialize/parse/
stripMarkersForRender(blank-replace, the #1036 vscode fix)/insertMarker + a markdown-it
block-start resolver. plan-review.ts editor path refactored to share the codec, no behavior
change.

Convention: chose B (keep "marker on line after anchor") over A (flip) BECAUSE A would
re-anchor existing markers one block off + force editor-path changes. B keeps existing
annotations untouched AND correctly anchored. Cost: core block-start resolver must stay in
parity with the canvas data-line rule -> parity contract test.

Existing annotations: NOT removed/rewritten. Blank-replace is in-memory read-path only;
add() only inserts; disk file unchanged. Confirmed to architect.

Open for plan-approval gate: parity-test approach for core/canvas block-map duplication; and
whether this PR closes the vscode side of #1036.

Branch still rebased LOCALLY (not force-pushed). Plan file rewritten but NOT yet committed —
awaiting architect ok to commit + force-push.
