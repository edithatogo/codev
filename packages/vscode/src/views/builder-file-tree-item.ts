import * as vscode from 'vscode';
import * as path from 'node:path';
import type { ChangeEntry, ChangeStatus, ResourcePlan } from '../commands/view-diff.js';

/**
 * Second-level tree row: one changed file under a builder in the Builders
 * view. Carries the typed fields the `codev.openBuilderFileDiff` handler
 * needs (it receives the item itself, like the backlog/builder rows, and
 * narrows via `instanceof`).
 *
 * `plan` (left/right `SideSpec`) is what feeds `diffUrisForChange`; `change`
 * carries the git status letter for the icon, title, and rename source.
 *
 * Used by views/builders.ts.
 */

const STATUS_ICON: Record<ChangeStatus, string> = {
  A: 'diff-added',
  D: 'diff-removed',
  R: 'diff-renamed',
  C: 'diff-renamed',
  M: 'diff-modified',
  T: 'diff-modified',
  U: 'diff-modified',
};

const STATUS_COLOR: Record<ChangeStatus, string> = {
  A: 'gitDecoration.addedResourceForeground',
  D: 'gitDecoration.deletedResourceForeground',
  R: 'gitDecoration.renamedResourceForeground',
  C: 'gitDecoration.renamedResourceForeground',
  M: 'gitDecoration.modifiedResourceForeground',
  T: 'gitDecoration.modifiedResourceForeground',
  U: 'gitDecoration.modifiedResourceForeground',
};

const STATUS_LABEL: Record<ChangeStatus, string> = {
  A: 'Added',
  D: 'Deleted',
  R: 'Renamed',
  C: 'Copied',
  M: 'Modified',
  T: 'Type changed',
  U: 'Unmerged',
};

export class BuilderFileTreeItem extends vscode.TreeItem {
  constructor(
    public readonly builderId: string,
    public readonly worktreePath: string,
    public readonly baseRef: string,
    public readonly change: ChangeEntry,
    public readonly plan: ResourcePlan,
  ) {
    const rel = plan.resourcePath;
    super(path.basename(rel));

    const dir = path.dirname(rel);
    const dirLabel = dir === '.' ? '' : dir;
    this.description =
      change.status === 'R' && change.oldPath
        ? `${dirLabel ? dirLabel + '  ' : ''}↤ ${change.oldPath}`
        : dirLabel;

    // resourceUri gives a real path for the diff/label; iconPath is set
    // explicitly to the status glyph (which overrides the file-type icon)
    // since "what changed and how" is the point of this list.
    this.resourceUri = vscode.Uri.file(path.join(worktreePath, rel));
    this.iconPath = new vscode.ThemeIcon(
      STATUS_ICON[change.status] ?? 'diff-modified',
      new vscode.ThemeColor(STATUS_COLOR[change.status] ?? 'gitDecoration.modifiedResourceForeground'),
    );
    this.tooltip = `${STATUS_LABEL[change.status] ?? 'Changed'} · ${rel}`;
    this.contextValue = 'builder-file';
    this.command = {
      command: 'codev.openBuilderFileDiff',
      title: 'Open Diff',
      arguments: [this],
    };
  }
}
