import * as vscode from 'vscode';
import type { WantsEditorContext, EditorContext, CommandRequest } from '@cluesmith/codev-types';
import { EDITOR_ROUTES, EDITOR_EVENTS } from '@cluesmith/codev-types';
import { parseSseEnvelope, parseSseBody } from './sse-envelope.js';
import { getDiffInjectEntry } from './diff-inject-codelens.js';
import type { ConnectionManager } from './connection-manager.js';

/**
 * VSCode as an EDITOR PROVIDER for Tower's editor + command relay.
 *
 * A controller (an external control device or companion app) drives the active
 * provider over Tower's existing channels:
 *  - Tower -> provider: `editor-wants-context` and `command` arrive as SSE
 *    envelopes via connectionManager.onSSEEvent.
 *  - provider -> Tower: the focused editor's context is POSTed to `/api/editor/context`.
 *
 * The `command` channel carries CANONICAL VERBS, not VSCode command ids. This map
 * is how *this* provider implements each verb, and it doubles as the security
 * allowlist: a verb absent from the map is ignored, so a compromised Tower or a
 * stray broadcast cannot drive an arbitrary VSCode command. Another provider (the
 * web dashboard) would implement the same verbs its own way.
 *
 * Context is emitted only while a controller wants it (subscriber gating) and only
 * from the OS-focused window, so multi-window setups report and drive exactly one
 * editor. Never pulls focus.
 */
const VERB_COMMANDS: Record<string, string> = {
  // Builder-scoped verbs (arg: builder id).
  'open-terminal': 'codev.openBuilderById',
  'view-diff': 'codev.viewDiff',
  'open-spec': 'codev.viewSpecFile',
  'open-plan': 'codev.viewPlanFile',
  'open-review': 'codev.viewReviewFile',
  'forward-hunk': 'codev.forwardCurrentHunkToBuilder',
  'forward-file': 'codev.forwardCurrentFileToBuilder',
  'run-dev': 'codev.runWorktreeDev',
  'spawn-builder': 'codev.spawnBuilder',
  // Context verbs (operate on the focused editor; no arg).
  'add-comment': 'codev.addReviewComment',
  'forward-selection': 'codev.forwardSelectionToBuilder',
  // Diff-review navigation.
  'diff-next-file': 'codev.diffNextFile',
  'diff-prev-file': 'codev.diffPreviousFile',
  'diff-first-file': 'codev.diffFirstFile',
  'diff-next-hunk': 'workbench.action.compareEditor.nextChange',
  'diff-prev-hunk': 'workbench.action.compareEditor.previousChange',
  'diff-first-hunk': 'codev.diffFirstHunk',
  // Workspace verbs (configurable Codev Action key / Dev Server key).
  'open-architect-terminal': 'codev.openArchitectTerminal',
  'open-builder-terminal': 'codev.openBuilderTerminal',
  'send-message': 'codev.sendMessage',
  'refresh-overview': 'codev.refreshOverview',
  'new-shell': 'codev.newShell',
  'workspace-dev-start': 'codev.runWorkspaceDev',
  'workspace-dev-stop': 'codev.stopWorkspaceDev',
};

const CONTEXT_THROTTLE_MS = 100;

const ARTIFACT_PATH = /[/\\]codev[/\\](specs|plans|reviews)[/\\]/;

/** A rate limiter: returns true at most once per `ms`, false in between. */
function makeThrottle(ms: number): () => boolean {
  let last = 0;
  return () => {
    const now = Date.now();
    if (now - last < ms) {return false;}
    last = now;
    return true;
  };
}

export function wireEditorProvider(connectionManager: ConnectionManager): vscode.Disposable {
  let contextListeners: vscode.Disposable | null = null;
  const contextThrottle = makeThrottle(CONTEXT_THROTTLE_MS);

  // POST to a Tower editor endpoint via the existing authenticated client.
  // Fire-and-forget: the provider never blocks on the response.
  const post = (path: string, body: unknown): void => {
    connectionManager.getClient()?.request(path, { method: 'POST', body: JSON.stringify(body) });
  };

  // The focused editor's context (is it a builder diff? an artifact? a
  // selection?), used by a controller to gate the forward / comment verbs.
  // Self-gates on focus: only the focused window is the authoritative editor.
  const emitContext = (): void => {
    if (!vscode.window.state.focused) {return;}
    if (!contextThrottle()) {return;}
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      post(EDITOR_ROUTES.context, { value: null });
      return;
    }
    const fsPath = editor.document.uri.fsPath;
    const entry = getDiffInjectEntry(fsPath);
    const value: EditorContext = {
      diffFocused: entry !== undefined,
      hasSelection: entry !== undefined && !editor.selection.isEmpty,
      artifactFocused: ARTIFACT_PATH.test(fsPath),
    };
    post(EDITOR_ROUTES.context, { value });
  };

  const startEmitting = (): void => {
    if (contextListeners) {return;}
    contextListeners = vscode.Disposable.from(
      vscode.window.onDidChangeActiveTextEditor(emitContext),
      vscode.window.onDidChangeWindowState(emitContext),
      vscode.window.onDidChangeTextEditorSelection(emitContext),
    );
    emitContext(); // push an initial context
  };

  const stopEmitting = (): void => {
    contextListeners?.dispose();
    contextListeners = null;
  };

  // Map a canonical verb to this provider's VSCode command and run it. A verb
  // absent from VERB_COMMANDS is ignored (the map is the allowlist).
  const runVerb = async (req: CommandRequest): Promise<void> => {
    // Self-gate on focus, like context: only the focused window runs a relayed
    // verb, so multiple windows on one workspace execute it exactly once (a single
    // active provider). Pending: a "claim active provider" handshake would let an
    // unfocused provider act; until then the focused window wins.
    if (!vscode.window.state.focused) {return;}
    const command = VERB_COMMANDS[req.verb];
    if (!command) {
      return; // unknown verb: ignore silently
    }
    // The verb operands arrive over the wire as `unknown[]`; a non-array (a stray
    // object) would throw on spread, so coerce to an empty arg list.
    const args = Array.isArray(req.args) ? req.args : [];
    try {
      await vscode.commands.executeCommand(command, ...args);
    } catch {
      // command failures surface in VSCode's own UI; nothing to relay back
    }
  };

  const onSse = connectionManager.onSSEEvent(({ data }) => {
    const envelope = parseSseEnvelope(data);
    if (!envelope) {return;}
    if (envelope.type === EDITOR_EVENTS.wantsContext) {
      const payload = parseSseBody<WantsEditorContext>(envelope.body);
      if (!payload) {return;}
      if (payload.wanted) {startEmitting();}
      else {stopEmitting();}
    } else if (envelope.type === EDITOR_EVENTS.command) {
      const cmd = parseSseBody<CommandRequest>(envelope.body);
      if (cmd) {runVerb(cmd);}
    }
  });

  return vscode.Disposable.from(onSse, { dispose: stopEmitting });
}
