import * as vscode from 'vscode';
import type { TeamApiResponse } from '@cluesmith/codev-types';
import type { ConnectionManager } from '../connection-manager.js';

export class TeamProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
  private readonly changeEmitter = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this.changeEmitter.event;
  private data: TeamApiResponse | null = null;

  constructor(private connectionManager: ConnectionManager) {
    connectionManager.onSSEEvent(() => this.refresh());
  }

  refresh(): void {
    this.fetchData();
  }

  getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: vscode.TreeItem): vscode.TreeItem[] {
    if (!this.data?.enabled || !this.data.members) { return []; }

    // Root level — member list
    if (!element) {
      return this.data.members.map(m => {
        const item = new vscode.TreeItem(
          `@${m.github} (${m.role})`,
          vscode.TreeItemCollapsibleState.Collapsed,
        );
        item.contextValue = 'team-member';
        item.iconPath = new vscode.ThemeIcon('person');
        (item as any)._memberData = m;
        return item;
      });
    }

    // Member details
    const member = (element as any)._memberData;
    if (!member?.github_data) { return []; }

    const items: vscode.TreeItem[] = [];
    const ghd = member.github_data;

    // Assigned issues are a count-only summary — the actual issue list lives
    // in the Backlog view; duplicating it per-member here is noise. Mirrors
    // the "Last 7d:" stat row (single informational row, no command).
    if (ghd.assignedIssues?.length) {
      const ti = new vscode.TreeItem(`Assigned: ${ghd.assignedIssues.length}`);
      ti.iconPath = new vscode.ThemeIcon('issues');
      items.push(ti);
    }

    // Open PRs: count-only summary — the PR list lives in the Pull Requests
    // view. Mirrors the "Assigned:" / "Last 7d:" stat rows.
    if (ghd.openPRs?.length) {
      const ti = new vscode.TreeItem(`Open PRs: ${ghd.openPRs.length}`);
      ti.iconPath = new vscode.ThemeIcon('git-pull-request');
      items.push(ti);
    }

    const merged = ghd.recentActivity?.mergedPRs?.length ?? 0;
    const closed = ghd.recentActivity?.closedIssues?.length ?? 0;
    if (merged || closed) {
      const ti = new vscode.TreeItem(`Last 7d: ${merged} merged, ${closed} closed`);
      ti.iconPath = new vscode.ThemeIcon('graph');
      items.push(ti);
    }

    return items;
  }

  private async fetchData(): Promise<void> {
    const client = this.connectionManager.getClient();
    const workspacePath = this.connectionManager.getWorkspacePath();
    if (!client || !workspacePath) {
      this.data = null;
      this.changeEmitter.fire();
      return;
    }

    try {
      const result = await client.request<TeamApiResponse>(
        `/workspace/${encodeWorkspacePath(workspacePath)}/api/team`,
      );
      this.data = result.ok ? result.data ?? null : null;
    } catch {
      this.data = null;
    }
    this.changeEmitter.fire();
  }
}

function encodeWorkspacePath(p: string): string {
  return Buffer.from(p).toString('base64url');
}
