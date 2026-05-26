/**
 * Regression: VS Code's Feature Contributions tab lists every declared
 * command regardless of `commandPalette` `when:false`. So palette-hidden
 * commands surface there too, and identical titles render as duplicate
 * lines on the extension's detail page (issue #838).
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const PKG = JSON.parse(
  readFileSync(resolve(__dirname, '../../package.json'), 'utf8'),
);

const commands: Array<{ command: string; title: string }> =
  PKG.contributes.commands;

describe('package.json contributes.commands', () => {
  it('has no two commands sharing the same title', () => {
    const byTitle = new Map<string, string[]>();
    for (const { command, title } of commands) {
      const list = byTitle.get(title) ?? [];
      list.push(command);
      byTitle.set(title, list);
    }
    const dupes = [...byTitle.entries()].filter(([, ids]) => ids.length > 1);
    expect(dupes, `duplicate titles: ${JSON.stringify(dupes)}`).toEqual([]);
  });

  it('has no debug-note-style parenthetical titles like "(and ...)"', () => {
    const offenders = commands.filter(({ title }) => /\(and\b/i.test(title));
    expect(offenders).toEqual([]);
  });
});
