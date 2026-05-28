import type { OverviewBacklogItem } from '@cluesmith/codev-types';

/**
 * Filter a backlog list to items assigned to `currentUser`. If
 * `currentUser` is empty / null / undefined (gh unavailable, not
 * authenticated), returns the input unchanged so the view doesn't
 * collapse to empty when we can't tell who "mine" is. Login matching
 * is case-insensitive.
 *
 * Lives in its own file (not in `backlog.ts`) so vitest unit tests can
 * import it without dragging in the `vscode` module. Same pattern the
 * codebase uses for any pure helper unit-tested from `__tests__/`.
 */
export function filterMine(
  items: OverviewBacklogItem[],
  currentUser: string | null | undefined,
): OverviewBacklogItem[] {
  const me = currentUser?.toLowerCase();
  if (!me) { return items; }
  return items.filter(item => !!item.assignees?.some(a => a.toLowerCase() === me));
}
