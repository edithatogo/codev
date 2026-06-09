/**
 * Unit tests for the pure diff/ref helpers behind the "Send to builder PTY"
 * CodeLens actions (#789). No `vscode` dependency, so the live implementation
 * is imported directly (same pattern as `architect-reference-injection.test.ts`).
 */

import { describe, it, expect } from 'vitest';
import {
  parseHunkRanges,
  parseUnifiedDiff,
  buildBuilderFileRef,
  buildBuilderHunkRef,
  buildLensDescriptors,
} from '../diff-inject-ref.js';

describe('parseHunkRanges', () => {
  it('reads the new-side start and length from each hunk header', () => {
    const patch = [
      '@@ -1,4 +1,6 @@',
      ' a',
      '+b',
      '@@ -20,3 +22,10 @@ func()',
      ' c',
    ].join('\n');
    expect(parseHunkRanges(patch)).toEqual([
      { newStart: 1, newEnd: 6 },
      { newStart: 22, newEnd: 31 },
    ]);
  });

  it('treats an absent new-side length as a single line', () => {
    expect(parseHunkRanges('@@ -10 +11 @@')).toEqual([{ newStart: 11, newEnd: 11 }]);
  });

  it('clamps a pure-deletion hunk (+c,0) to a single anchor line', () => {
    expect(parseHunkRanges('@@ -5,3 +4,0 @@')).toEqual([{ newStart: 4, newEnd: 4 }]);
  });

  it('ignores non-hunk lines, including content that looks like @@', () => {
    const patch = ['+const x = "@@ not a header";', '@@ -1,1 +1,2 @@'].join('\n');
    expect(parseHunkRanges(patch)).toEqual([{ newStart: 1, newEnd: 2 }]);
  });
});

describe('parseUnifiedDiff', () => {
  it('maps each file new-path to its hunk ranges', () => {
    const patch = [
      'diff --git a/src/a.ts b/src/a.ts',
      'index 111..222 100644',
      '--- a/src/a.ts',
      '+++ b/src/a.ts',
      '@@ -1,2 +1,3 @@',
      ' x',
      '+y',
      'diff --git a/src/b.ts b/src/b.ts',
      'index 333..444 100644',
      '--- a/src/b.ts',
      '+++ b/src/b.ts',
      '@@ -10,0 +11,2 @@',
      '+p',
      '+q',
    ].join('\n');
    const map = parseUnifiedDiff(patch);
    expect(map.get('src/a.ts')).toEqual([{ newStart: 1, newEnd: 3 }]);
    expect(map.get('src/b.ts')).toEqual([{ newStart: 11, newEnd: 12 }]);
  });

  it('uses the new path for a rename (+++ b/<new>)', () => {
    const patch = [
      'diff --git a/old/name.ts b/new/name.ts',
      'similarity index 90%',
      'rename from old/name.ts',
      'rename to new/name.ts',
      '--- a/old/name.ts',
      '+++ b/new/name.ts',
      '@@ -3,1 +3,2 @@',
      '+added',
    ].join('\n');
    const map = parseUnifiedDiff(patch);
    expect([...map.keys()]).toEqual(['new/name.ts']);
    expect(map.get('new/name.ts')).toEqual([{ newStart: 3, newEnd: 4 }]);
  });

  it('omits deleted files (new side is /dev/null)', () => {
    const patch = [
      'diff --git a/gone.ts b/gone.ts',
      'deleted file mode 100644',
      '--- a/gone.ts',
      '+++ /dev/null',
      '@@ -1,3 +0,0 @@',
      '-x',
    ].join('\n');
    expect(parseUnifiedDiff(patch).size).toBe(0);
  });
});

describe('ref builders', () => {
  it('builds a file ref with a trailing space and no newline', () => {
    expect(buildBuilderFileRef('packages/vscode/src/extension.ts'))
      .toBe('packages/vscode/src/extension.ts ');
  });

  it('builds a hunk ref with the L<start>-L<end> range', () => {
    expect(buildBuilderHunkRef('a/b.ts', 10, 20)).toBe('a/b.ts:L10-L20 ');
  });
});

describe('buildLensDescriptors', () => {
  it('emits a file-level lens at line 0 plus one lens per hunk', () => {
    const lenses = buildLensDescriptors('a/b.ts', [
      { newStart: 5, newEnd: 9 },
      { newStart: 30, newEnd: 30 },
    ]);
    expect(lenses).toEqual([
      { line: 0, title: 'Send to builder PTY', refText: 'a/b.ts ' },
      { line: 4, title: 'Send to builder PTY (lines 5-9)', refText: 'a/b.ts:L5-L9 ' },
      { line: 29, title: 'Send to builder PTY (lines 30-30)', refText: 'a/b.ts:L30-L30 ' },
    ]);
  });

  it('clamps a hunk anchored at line 1 to a non-negative index', () => {
    const lenses = buildLensDescriptors('a/b.ts', [{ newStart: 1, newEnd: 1 }]);
    expect(lenses[1]!.line).toBe(0);
  });

  it('emits just the file-level lens when there are no hunks', () => {
    expect(buildLensDescriptors('a/b.ts', [])).toEqual([
      { line: 0, title: 'Send to builder PTY', refText: 'a/b.ts ' },
    ]);
  });
});
