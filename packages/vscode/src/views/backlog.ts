import * as vscode from 'vscode';
import type { OverviewBacklogItem } from '@cluesmith/codev-types';
import { UNCATEGORIZED_AREA } from '@cluesmith/codev-core/constants';
import type { OverviewCache } from './overview-data.js';
import { BacklogGroupTreeItem, BacklogTreeItem } from './backlog-tree-item.js';

const CROSS_CUTTING_AREA = 'cross-cutting';
const EXPANSION_STATE_KEY = 'codev.backlogGroupExpansion';

/**
 * Backlog rows the user can act on — exclude issues that already have an
 * active builder. Mirrors the dashboard's BacklogList
 * (`items.filter(i => !i.hasBuilder)`) so the extension and web show the
 * same "available work" set and you can't double-spawn from the Backlog.
 */
export function spawnableBacklog(items: OverviewBacklogItem[]): OverviewBacklogItem[] {
  return items.filter(i => !i.hasBuilder);
}

/**
 * Group backlog items by their resolved `area` (already projected on the
 * server via `parseArea`; see #819). Returned groups are ordered:
 *
 *   1. `cross-cutting` (highest-coordination-risk surfaced first)
 *   2. alphabetical specific areas
 *   3. `Uncategorized` (last)
 *
 * Within-group order preserves the input order — the caller has already
 * applied any "mine-first" or sort policy. Empty groups are omitted
 * (no `<area> (0)` headers).
 *
 * Pure function — no VSCode dependency, unit-testable.
 *
 * Cross-cutting detection relies on the documented convention: an issue
 * tagged ONLY `area/cross-cutting` arrives here with `area === 'cross-cutting'`.
 * Issues that mix `area/cross-cutting` with another area label land in
 * the alphabetically-first specific area per `parseArea`'s server-side
 * projection. The framework parser is policy-free about label semantics
 * by design (see #819); the cross-cutting convention is a view-layer
 * UX choice.
 */
export function groupBacklogByArea(
  items: OverviewBacklogItem[],
): Array<{ area: string; items: OverviewBacklogItem[] }> {
  const buckets = new Map<string, OverviewBacklogItem[]>();
  for (const item of items) {
    const area = item.area || UNCATEGORIZED_AREA;
    const bucket = buckets.get(area);
    if (bucket) {
      bucket.push(item);
    } else {
      buckets.set(area, [item]);
    }
  }

  const result: Array<{ area: string; items: OverviewBacklogItem[] }> = [];
  const crossCutting = buckets.get(CROSS_CUTTING_AREA);
  if (crossCutting) {
    result.push({ area: CROSS_CUTTING_AREA, items: crossCutting });
    buckets.delete(CROSS_CUTTING_AREA);
  }

  const uncategorized = buckets.get(UNCATEGORIZED_AREA);
  buckets.delete(UNCATEGORIZED_AREA);

  const specifics = [...buckets.keys()].sort();
  for (const area of specifics) {
    result.push({ area, items: buckets.get(area)! });
  }

  if (uncategorized) {
    result.push({ area: UNCATEGORIZED_AREA, items: uncategorized });
  }

  return result;
}

/**
 * Backlog view: open GitHub issues with no PR yet, grouped by `area/*`
 * label. Group ordering: `cross-cutting` → alphabetical specifics →
 * `Uncategorized`. Within each group, items assigned to the current
 * user (auto-detected via OverviewData.currentUser) sort to the top
 * with an `account` icon; the rest keep `issues`. Order within those
 * two segments preserves Tower's order.
 *
 * Row click starts work: it invokes codev.viewBacklogIssue with the
 * issue number pre-filled. Browser / copy / spawn actions live in the
 * right-click context menu (see package.json view/item/context).
 *
 * Group expand/collapse state persists per area name via
 * `workspaceState` under `codev.backlogGroupExpansion`. Default for
 * any group the user hasn't touched: expanded.
 */
export class BacklogProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
  private readonly changeEmitter = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this.changeEmitter.event;

  constructor(
    private readonly cache: OverviewCache,
    private readonly workspaceState: vscode.Memento,
  ) {
    cache.onDidChange(() => this.changeEmitter.fire());
  }

  getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: vscode.TreeItem): vscode.TreeItem[] {
    if (element instanceof BacklogGroupTreeItem) {
      return this.rowsForGroup(element.areaName);
    }
    if (element) {
      return [];
    }
    return this.groupHeaders();
  }

  /**
   * Persist a user's expand/collapse choice for an area group. Called
   * from `extension.ts` via `backlogView.onDidExpand/CollapseElement`.
   */
  setGroupExpanded(areaName: string, expanded: boolean): void {
    const map = this.readExpansionState();
    map[areaName] = expanded;
    void this.workspaceState.update(EXPANSION_STATE_KEY, map);
  }

  private groupHeaders(): vscode.TreeItem[] {
    const data = this.cache.getData();
    if (!data) { return []; }

    const items = this.orderedSpawnable(data);
    const groups = groupBacklogByArea(items);
    const expansion = this.readExpansionState();
    return groups.map(g => {
      const expanded = expansion[g.area] ?? true;
      const state = expanded
        ? vscode.TreeItemCollapsibleState.Expanded
        : vscode.TreeItemCollapsibleState.Collapsed;
      return new BacklogGroupTreeItem(g.area, g.items.length, state);
    });
  }

  private rowsForGroup(areaName: string): vscode.TreeItem[] {
    const data = this.cache.getData();
    if (!data) { return []; }

    const items = this.orderedSpawnable(data);
    const group = groupBacklogByArea(items).find(g => g.area === areaName);
    if (!group) { return []; }

    const me = data.currentUser?.toLowerCase();
    const isMine = (item: OverviewBacklogItem) =>
      !!me && !!item.assignees?.some(a => a.toLowerCase() === me);

    return group.items.map(item => {
      const assigned = isMine(item);
      const author = item.author ? ` @${item.author}` : '';
      const ti = new BacklogTreeItem(item.id, item.url, `#${item.id} ${item.title}${author}`);
      ti.tooltip = item.url;
      ti.contextValue = 'backlog-item';
      ti.iconPath = new vscode.ThemeIcon(assigned ? 'account' : 'issues');
      if (assigned) { ti.description = 'assigned to you'; }
      ti.command = {
        command: 'codev.viewBacklogIssue',
        title: 'View Issue',
        arguments: [item.id],
      };
      return ti;
    });
  }

  /**
   * Spawnable items in display order (mine-first, then rest), preserving
   * Tower's order within each segment. Identical to the pre-grouping
   * behavior so within-group ordering matches the old flat list.
   */
  private orderedSpawnable(data: NonNullable<ReturnType<OverviewCache['getData']>>): OverviewBacklogItem[] {
    const me = data.currentUser?.toLowerCase();
    const isMine = (item: OverviewBacklogItem) =>
      !!me && !!item.assignees?.some(a => a.toLowerCase() === me);

    const items = spawnableBacklog(data.backlog);
    const mine = items.filter(isMine);
    const rest = items.filter(item => !isMine(item));
    return [...mine, ...rest];
  }

  private readExpansionState(): Record<string, boolean> {
    return this.workspaceState.get<Record<string, boolean>>(EXPANSION_STATE_KEY, {});
  }
}
