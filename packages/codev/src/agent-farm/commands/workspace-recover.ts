// workspace recover — revive builders whose shellper died (e.g. machine reboot).
// Issue #829. Dry-run by default; --apply actually respawns.

import { spawn } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import chalk from 'chalk';

import { getConfig } from '../utils/index.js';
import { logger } from '../utils/logger.js';
import { buildAgentName, stripLeadingZeros } from '../utils/agent-names.js';
import { processExists, getTerminalSessionsForWorkspace } from '../servers/tower-terminals.js';
import { closeGlobalDb } from '../db/index.js';
import { listAllProjects } from '../../commands/porch/state.js';
import type { ProjectState } from '../../commands/porch/types.js';
import type { DbTerminalSession } from '../servers/tower-types.js';
import { confirm } from '../../lib/cli-prompts.js';

const TERMINAL_PHASES = new Set(['verified', 'complete']);
const SPIDER_TO_SPIR = 'spir';
const DEFAULT_MAX_AGE_DAYS = 7;

export interface WorkspaceRecoverOptions {
  apply?: boolean;
  maxAge?: number;
  includeStale?: boolean;
  yes?: boolean;
}

export type IneligibleReason =
  | 'terminal'
  | 'no_session_row'
  | 'shellper_alive'
  | 'worktree_missing'
  | 'stale';

export type EligibilityResult =
  | { eligible: true }
  | { eligible: false; reason: IneligibleReason };

export interface EligibilityInputs {
  state: ProjectState;
  session: DbTerminalSession | null;
  worktreeExists: boolean;
  ageDays: number;
  maxAgeDays: number;
  includeStale: boolean;
  isProcessAlive: (pid: number) => boolean;
  socketExists: (socket: string) => boolean;
}

/**
 * Pure predicate — no I/O. All filesystem and process probes happen in the
 * caller and are passed in via `isProcessAlive` and `socketExists`. This keeps
 * the predicate trivially unit-testable.
 *
 * Order matters: cheap structural checks (phase, session row) come first;
 * filesystem-touching checks (worktree, socket) later.
 */
export function evaluateEligibility(inputs: EligibilityInputs): EligibilityResult {
  const {
    state, session, worktreeExists, ageDays, maxAgeDays, includeStale,
    isProcessAlive, socketExists,
  } = inputs;

  if (TERMINAL_PHASES.has(state.phase)) {
    return { eligible: false, reason: 'terminal' };
  }
  if (!session) {
    return { eligible: false, reason: 'no_session_row' };
  }

  // Either signal of life keeps the builder out of the revive set.
  // We don't try to open the socket — file existence + PID liveness is enough
  // and avoids any chance of disturbing a healthy shellper.
  const pidAlive = session.shellper_pid !== null && isProcessAlive(session.shellper_pid);
  const socketPresent = session.shellper_socket !== null && socketExists(session.shellper_socket);
  if (pidAlive || socketPresent) {
    return { eligible: false, reason: 'shellper_alive' };
  }

  if (!worktreeExists) {
    return { eligible: false, reason: 'worktree_missing' };
  }
  if (!includeStale && ageDays > maxAgeDays) {
    return { eligible: false, reason: 'stale' };
  }
  return { eligible: true };
}

export interface BuilderInfo {
  builderId: string;
  issueArg: string;
  cliProtocol: string;
}

/**
 * Derive the inputs needed to invoke `afx spawn <issueArg> --resume --protocol <cliProtocol>`
 * and the SQLite `role_id` to look up the builder's terminal session.
 *
 * Normalizes the legacy `spider` protocol alias to `spir`.
 */
export function deriveBuilderInfo(state: ProjectState): BuilderInfo {
  const rawProtocol = state.protocol === 'spider' ? SPIDER_TO_SPIR : state.protocol;

  if (state.protocol === 'bugfix') {
    const numericId = state.id.replace(/^bugfix-/, '');
    return {
      builderId: buildAgentName('bugfix', numericId),
      issueArg: numericId,
      cliProtocol: 'bugfix',
    };
  }
  return {
    builderId: buildAgentName('spec', state.id, rawProtocol),
    issueArg: stripLeadingZeros(state.id),
    cliProtocol: rawProtocol,
  };
}

/**
 * Resolve the builder's worktree path on disk, handling both the Spec-653
 * ID-only layout and the legacy title-suffixed form.
 */
export function resolveWorktreePath(buildersDir: string, state: ProjectState): string | null {
  const info = deriveBuilderInfo(state);
  const idOnlyName = `${info.cliProtocol}-${info.issueArg}`;
  const idOnlyPath = join(buildersDir, idOnlyName);
  if (existsSync(idOnlyPath) && existsSync(join(idOnlyPath, '.git'))) {
    return idOnlyPath;
  }

  if (!existsSync(buildersDir)) return null;
  const prefix = `${info.cliProtocol}-${info.issueArg}-`;
  for (const entry of readdirSync(buildersDir, { withFileTypes: true })) {
    if (!entry.isDirectory() || !entry.name.startsWith(prefix)) continue;
    const candidate = join(buildersDir, entry.name);
    if (existsSync(join(candidate, '.git'))) return candidate;
  }
  return null;
}

export function formatRelativeAge(iso: string): string {
  const ms = Date.now() - Date.parse(iso);
  if (Number.isNaN(ms) || ms < 0) return '—';
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function reasonLabel(reason: IneligibleReason): string {
  switch (reason) {
    case 'terminal': return 'terminal';
    case 'no_session_row': return 'no session row';
    case 'shellper_alive': return 'shellper alive';
    case 'worktree_missing': return 'worktree missing';
    case 'stale': return 'stale';
  }
}

interface RecoverRow {
  state: ProjectState;
  builderInfo: BuilderInfo;
  worktreePath: string | null;
  eligibility: EligibilityResult;
}

function printPreview(rows: RecoverRow[]): void {
  const widths = [6, 9, 12, 14, 10, 20];
  logger.row(['ID', 'PROTOCOL', 'PHASE', 'UPDATED', 'STATUS', 'REASON'], widths);
  logger.row(['─'.repeat(6), '─'.repeat(9), '─'.repeat(12), '─'.repeat(14), '─'.repeat(10), '─'.repeat(20)], widths);
  for (const row of rows) {
    const status = row.eligibility.eligible
      ? chalk.green('revive')
      : chalk.gray('skip');
    const reason = row.eligibility.eligible ? '—' : reasonLabel(row.eligibility.reason);
    logger.row(
      [
        row.state.id,
        row.state.protocol,
        row.state.phase,
        formatRelativeAge(row.state.updated_at),
        status,
        reason,
      ],
      widths,
    );
  }
}

async function respawnBuilder(info: BuilderInfo): Promise<void> {
  await new Promise<void>((resolvePromise, rejectPromise) => {
    const child = spawn(
      'afx',
      ['spawn', info.issueArg, '--resume', '--protocol', info.cliProtocol],
      { stdio: 'inherit' },
    );
    child.on('error', rejectPromise);
    child.on('exit', (code) => {
      if (code === 0) resolvePromise();
      else rejectPromise(new Error(`afx spawn exited with code ${code}`));
    });
  });
}

export async function workspaceRecover(options: WorkspaceRecoverOptions = {}): Promise<void> {
  const config = getConfig();
  const maxAgeDays = options.maxAge ?? DEFAULT_MAX_AGE_DAYS;
  const includeStale = options.includeStale ?? false;
  const apply = options.apply ?? false;

  logger.header(`Workspace Recover${apply ? '' : ' (dry-run)'}`);
  logger.kv('Workspace', config.workspaceRoot);
  if (!includeStale) logger.kv('Max age', `${maxAgeDays} day(s)`);
  logger.blank();

  const projects = listAllProjects(config.workspaceRoot);
  if (projects.length === 0) {
    logger.info('No porch projects found.');
    return;
  }

  let sessions: DbTerminalSession[];
  try {
    sessions = getTerminalSessionsForWorkspace(config.workspaceRoot);
  } finally {
    closeGlobalDb();
  }
  const sessionByRoleId = new Map<string, DbTerminalSession>();
  for (const s of sessions) {
    if (s.type === 'builder' && s.role_id) sessionByRoleId.set(s.role_id, s);
  }

  const rows: RecoverRow[] = projects.map(({ state }) => {
    const builderInfo = deriveBuilderInfo(state);
    const session = sessionByRoleId.get(builderInfo.builderId) ?? null;
    const worktreePath = resolveWorktreePath(config.buildersDir, state);
    const ageDays = (Date.now() - Date.parse(state.updated_at)) / 86_400_000;
    const eligibility = evaluateEligibility({
      state, session,
      worktreeExists: worktreePath !== null,
      ageDays, maxAgeDays, includeStale,
      isProcessAlive: processExists,
      socketExists: existsSync,
    });
    return { state, builderInfo, worktreePath, eligibility };
  });

  printPreview(rows);

  const eligible = rows.filter((r): r is RecoverRow & { eligibility: { eligible: true } } => r.eligibility.eligible);
  logger.blank();
  logger.kv('Eligible', `${eligible.length} / ${rows.length}`);

  if (eligible.length === 0) {
    logger.info(apply ? 'Nothing to revive.' : 'Nothing would be revived.');
    return;
  }

  if (!apply) {
    logger.info(`Run with --apply to respawn ${eligible.length} builder(s).`);
    return;
  }

  if (!options.yes) {
    const proceed = await confirm(`Proceed to respawn ${eligible.length} builder(s)?`, false);
    if (!proceed) {
      logger.info('Aborted.');
      return;
    }
  }

  let succeeded = 0;
  let failed = 0;
  for (const row of eligible) {
    logger.blank();
    logger.info(`Respawning ${row.builderInfo.builderId} (issue ${row.builderInfo.issueArg}, ${row.builderInfo.cliProtocol})...`);
    try {
      await respawnBuilder(row.builderInfo);
      succeeded++;
    } catch (err) {
      failed++;
      logger.error(`Failed to respawn ${row.builderInfo.builderId}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  logger.blank();
  logger.kv('Respawned', String(succeeded));
  if (failed > 0) {
    logger.kv('Failed', String(failed));
    process.exit(1);
  }
}
