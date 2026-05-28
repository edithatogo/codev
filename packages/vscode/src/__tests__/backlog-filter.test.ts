/**
 * Unit tests for `filterMine`, the pure helper that powers the
 * Backlog view's mine-only / show-all toggle. Lives in `__tests__/`
 * (vitest harness) rather than `src/test/` (vscode-test Electron
 * harness) because it touches no `vscode` APIs.
 */

import { describe, it, expect } from 'vitest';
import type { OverviewBacklogItem } from '@cluesmith/codev-types';
import { filterMine } from '../views/backlog-filter.js';

function assignedItem(id: string, assignees: string[]): OverviewBacklogItem {
  return { id, title: `t${id}`, hasBuilder: false, assignees } as unknown as OverviewBacklogItem;
}

describe('filterMine', () => {
  it('keeps only items assigned to currentUser', () => {
    const out = filterMine([
      assignedItem('1', ['alice']),
      assignedItem('2', ['bob']),
      assignedItem('3', ['alice', 'carol']),
    ], 'alice');
    expect(out.map(i => i.id)).toEqual(['1', '3']);
  });

  it('returns input unchanged when currentUser is null (gh-unavailable fallback)', () => {
    const items = [
      assignedItem('1', ['alice']),
      assignedItem('2', []),
    ];
    expect(filterMine(items, null).map(i => i.id)).toEqual(['1', '2']);
    expect(filterMine(items, undefined).map(i => i.id)).toEqual(['1', '2']);
    expect(filterMine(items, '').map(i => i.id)).toEqual(['1', '2']);
  });

  it('matches logins case-insensitively', () => {
    const out = filterMine([
      assignedItem('1', ['Alice']),
      assignedItem('2', ['BOB']),
    ], 'alice');
    expect(out.map(i => i.id)).toEqual(['1']);
  });

  it('returns empty for empty input', () => {
    expect(filterMine([], 'alice')).toEqual([]);
  });

  it('drops items with missing assignees field when filtering', () => {
    const noAssignees = { id: 'x', title: 'tx', hasBuilder: false } as unknown as OverviewBacklogItem;
    const out = filterMine([noAssignees, assignedItem('y', ['alice'])], 'alice');
    expect(out.map(i => i.id)).toEqual(['y']);
  });
});
