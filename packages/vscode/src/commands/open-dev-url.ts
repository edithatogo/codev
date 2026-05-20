/**
 * Codev: Open Dev URL — open a URL configured under `worktree.devUrl`
 * (legacy single) or `worktree.devUrls` (multi, labeled) in the user's
 * default browser. Surfaced as one workspace-view row per configured
 * URL (label = row text) plus a palette command.
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
 * `.codev/config.json`. Mirrors the resolution rule in core's
 * `getWorktreeConfig`: `devUrls` (array) wins over `devUrl` (legacy
 * single); a single `devUrl` is normalized to `[{ label: "Open Dev URL", url }]`.
 * Returns `[]` for missing/malformed config so callers don't have to
 * branch.
 */
export function readWorktreeDevUrls(workspacePath: string | null): WorktreeDevUrl[] {
  if (!workspacePath) { return []; }
  try {
    const raw = fs.readFileSync(path.join(workspacePath, '.codev', 'config.json'), 'utf-8');
    const parsed = JSON.parse(raw) as {
      worktree?: {
        devUrl?: unknown;
        devUrls?: unknown;
      };
    };
    const w = parsed.worktree;
    if (Array.isArray(w?.devUrls)) {
      return w.devUrls
        .map((e): WorktreeDevUrl => {
          const label = e && typeof (e as { label?: unknown }).label === 'string'
            ? ((e as { label: string }).label).trim() : '';
          const url = e && typeof (e as { url?: unknown }).url === 'string'
            ? ((e as { url: string }).url).trim() : '';
          return { label, url };
        })
        .filter(e => e.label && e.url);
    }
    if (typeof w?.devUrl === 'string' && w.devUrl.trim()) {
      return [{ label: 'Open Dev URL', url: w.devUrl.trim() }];
    }
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
      'Codev: `worktree.devUrl` / `worktree.devUrls` not configured in `.codev/config.json`',
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
