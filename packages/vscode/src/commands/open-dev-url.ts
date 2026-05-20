/**
 * Codev: Open Dev URL — open URLs configured under `worktree.devUrls`
 * in the user's default browser. Surfaced as one workspace-view row
 * per configured URL (label = row text), plus a palette command.
 * Both `label` and `url` are mandatory per schema; entries missing
 * either are silently filtered out.
 *
 * Why the default browser over VSCode's Simple Browser: DevTools /
 * Console / Network are dev-loop essentials Simple Browser doesn't
 * have, and a real browser sidesteps the third-party-cookie issues
 * that come from loading the dev URL inside a `vscode-webview://`
 * iframe.
 */

import * as vscode from 'vscode';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { ConnectionManager } from '../connection-manager.js';

export interface WorktreeDevUrl {
  label: string;
  url: string;
}

/**
 * Read the canonical resolved dev-URL list from the workspace's
 * `.codev/config.json`. Filters entries missing either `label` or
 * `url` (both are mandatory per schema). Returns `[]` for
 * missing/malformed config so callers don't have to branch.
 */
export function readWorktreeDevUrls(workspacePath: string | null): WorktreeDevUrl[] {
  if (!workspacePath) { return []; }
  try {
    const raw = fs.readFileSync(path.join(workspacePath, '.codev', 'config.json'), 'utf-8');
    const parsed = JSON.parse(raw) as { worktree?: { devUrls?: unknown } };
    const devUrls = parsed.worktree?.devUrls;
    if (!Array.isArray(devUrls)) { return []; }
    return devUrls
      .map((e): WorktreeDevUrl => ({
        label: e && typeof (e as { label?: unknown }).label === 'string'
          ? ((e as { label: string }).label).trim() : '',
        url: e && typeof (e as { url?: unknown }).url === 'string'
          ? ((e as { url: string }).url).trim() : '',
      }))
      .filter(e => e.label && e.url);
  } catch {
    // benign — fall through to []
  }
  return [];
}

export async function openDevUrl(
  connectionManager: ConnectionManager,
  urlArg?: string,
): Promise<void> {
  // Direct invocation: a row click passes its URL; just open it.
  if (typeof urlArg === 'string' && urlArg.trim()) {
    await vscode.env.openExternal(vscode.Uri.parse(urlArg));
    return;
  }

  // Palette / arg-less invocation: resolve from config and route.
  const workspacePath = connectionManager.getWorkspacePath();
  const devUrls = readWorktreeDevUrls(workspacePath);

  if (devUrls.length === 0) {
    vscode.window.showWarningMessage(
      'Codev: `worktree.devUrls` not configured in `.codev/config.json`',
    );
    return;
  }
  if (devUrls.length === 1) {
    await vscode.env.openExternal(vscode.Uri.parse(devUrls[0]!.url));
    return;
  }

  const picked = await vscode.window.showQuickPick(
    devUrls.map(d => ({ label: d.label, description: d.url, url: d.url })),
    { placeHolder: 'Open which dev URL?' },
  );
  if (picked) {
    await vscode.env.openExternal(vscode.Uri.parse(picked.url));
  }
}
