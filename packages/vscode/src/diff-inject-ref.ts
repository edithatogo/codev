/**
 * Pure helpers for the "Send to builder PTY" CodeLens actions in the
 * `codev.viewDiff` editor (issue #789). No `vscode` import — same precedent
 * as `architect-reference-injection.ts`, so the parsing/string logic is
 * unit-tested directly without mocking the editor API.
 *
 * The provider (`diff-inject-codelens.ts`) is thin glue over these: it turns
 * `LensDescriptor`s into `vscode.CodeLens` objects and wires the inject
 * command. All the line-math and ref-string logic lives here.
 */

/** New-side line range of one diff hunk (1-based, inclusive). */
export interface HunkRange {
  newStart: number;
  newEnd: number;
}

/**
 * Editor-agnostic description of one CodeLens to render: the 0-based line to
 * anchor it on, the label, and the text to inject into the builder prompt.
 */
export interface LensDescriptor {
  /** 0-based anchor line (the provider clamps to the document bounds). */
  line: number;
  title: string;
  /** Text typed into the builder terminal — always ends with a space, no Enter. */
  refText: string;
}

const HUNK_HEADER = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/;

/**
 * Parse the `@@ -a,b +c,d @@` hunk headers from a single file's unified diff
 * and return each hunk's new-side line range.
 *
 * - New-side length is `d` (absent → 1, matching git's shorthand for a
 *   single added/changed line).
 * - A pure-deletion hunk (`+c,0`) has no new-side lines; we clamp it to a
 *   single anchor at `c` (or line 1 if `c` is 0) so a click still references
 *   a sane location near the change.
 */
export function parseHunkRanges(patch: string): HunkRange[] {
  const ranges: HunkRange[] = [];
  for (const line of patch.split('\n')) {
    const m = HUNK_HEADER.exec(line);
    if (!m) { continue; }
    const newStart = Number(m[1]);
    const len = m[2] === undefined ? 1 : Number(m[2]);
    if (len <= 0) {
      const anchor = Math.max(newStart, 1);
      ranges.push({ newStart: anchor, newEnd: anchor });
    } else {
      ranges.push({ newStart, newEnd: newStart + len - 1 });
    }
  }
  return ranges;
}

/**
 * Split a multi-file unified diff (`git diff -M --unified=N <ref>`) into a
 * map from each file's **new** path to its hunk ranges. The new path is read
 * from the `+++ b/<path>` line (the canonical new-side path, correct for
 * renames); files whose new side is `/dev/null` (deletions) are omitted —
 * they have no right-side document to host a lens.
 */
export function parseUnifiedDiff(patch: string): Map<string, HunkRange[]> {
  const out = new Map<string, HunkRange[]>();
  // Split on the per-file boundary; the first chunk before any `diff --git`
  // is empty/preamble and parses to no path, so it's harmless.
  const sections = patch.split(/^diff --git .*$/m).slice(1);
  // `split` drops the delimiter lines, but the `+++`/`@@` lines we need live
  // in the body after each boundary, so re-walk the raw text per section.
  for (const section of sections) {
    const newPath = newPathFromSection(section);
    if (!newPath) { continue; }
    out.set(newPath, parseHunkRanges(section));
  }
  return out;
}

/** Extract the new-side path from a single file section's `+++ b/<path>` line. */
function newPathFromSection(section: string): string | null {
  for (const line of section.split('\n')) {
    if (!line.startsWith('+++ ')) { continue; }
    const target = line.slice(4).trim();
    if (target === '/dev/null') { return null; }
    // Strip the conventional `b/` prefix git prepends to the new path.
    return target.startsWith('b/') ? target.slice(2) : target;
  }
  return null;
}

/** Text injected by the file-level lens: `<repo-relative-path> ` (no Enter). */
export function buildBuilderFileRef(relPath: string): string {
  return `${relPath} `;
}

/** Text injected by a hunk lens: `<repo-relative-path>:L<start>-L<end> ` (no Enter). */
export function buildBuilderHunkRef(relPath: string, start: number, end: number): string {
  return `${relPath}:L${start}-L${end} `;
}

/**
 * Build the full set of lens descriptors for one changed file: a file-level
 * lens at the top, plus one lens per hunk anchored at the hunk's new-side
 * start line (converted to 0-based).
 */
export function buildLensDescriptors(relPath: string, hunks: HunkRange[]): LensDescriptor[] {
  const lenses: LensDescriptor[] = [
    { line: 0, title: 'Send to builder PTY', refText: buildBuilderFileRef(relPath) },
  ];
  for (const h of hunks) {
    lenses.push({
      line: Math.max(h.newStart - 1, 0),
      title: `Send to builder PTY (lines ${h.newStart}-${h.newEnd})`,
      refText: buildBuilderHunkRef(relPath, h.newStart, h.newEnd),
    });
  }
  return lenses;
}
