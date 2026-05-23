/**
 * Tests for `afx workspace recover` — eligibility predicate, builder-info
 * derivation, worktree resolution, and listAllProjects precedence.
 *
 * Issue #829.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  evaluateEligibility,
  deriveBuilderInfo,
  resolveWorktreePath,
  formatRelativeAge,
  type EligibilityInputs,
} from '../commands/workspace-recover.js';
import { listAllProjects } from '../../commands/porch/state.js';
import type { ProjectState } from '../../commands/porch/types.js';
import type { DbTerminalSession } from '../servers/tower-types.js';

function makeState(overrides: Partial<ProjectState> = {}): ProjectState {
  return {
    id: '0087',
    title: 'Test project',
    protocol: 'spir',
    phase: 'implement',
    plan_phases: [],
    current_plan_phase: null,
    gates: {},
    iteration: 1,
    build_complete: false,
    history: [],
    started_at: '2026-05-20T00:00:00.000Z',
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

function makeSession(overrides: Partial<DbTerminalSession> = {}): DbTerminalSession {
  return {
    id: 'term-123',
    workspace_path: '/workspace',
    type: 'builder',
    role_id: 'builder-spir-87',
    pid: null,
    shellper_socket: '/tmp/shellper.sock',
    shellper_pid: 12345,
    shellper_start_time: Date.now(),
    label: null,
    cwd: null,
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

function defaults(): Omit<EligibilityInputs, 'state' | 'session' | 'worktreeExists' | 'ageDays'> {
  return {
    maxAgeDays: 7,
    includeStale: false,
    isProcessAlive: () => false,
    socketExists: () => false,
  };
}

describe('evaluateEligibility', () => {
  it('skips terminal phase (verified)', () => {
    const result = evaluateEligibility({
      state: makeState({ phase: 'verified' }),
      session: makeSession(),
      worktreeExists: true,
      ageDays: 0,
      ...defaults(),
    });
    expect(result).toEqual({ eligible: false, reason: 'terminal' });
  });

  it('skips terminal phase (complete)', () => {
    const result = evaluateEligibility({
      state: makeState({ phase: 'complete' }),
      session: makeSession(),
      worktreeExists: true,
      ageDays: 0,
      ...defaults(),
    });
    expect(result).toEqual({ eligible: false, reason: 'terminal' });
  });

  it('skips when no terminal_sessions row exists', () => {
    const result = evaluateEligibility({
      state: makeState(),
      session: null,
      worktreeExists: true,
      ageDays: 0,
      ...defaults(),
    });
    expect(result).toEqual({ eligible: false, reason: 'no_session_row' });
  });

  it('skips when shellper PID is alive', () => {
    const result = evaluateEligibility({
      state: makeState(),
      session: makeSession(),
      worktreeExists: true,
      ageDays: 0,
      ...defaults(),
      isProcessAlive: () => true,
    });
    expect(result).toEqual({ eligible: false, reason: 'shellper_alive' });
  });

  it('skips when socket file still exists (treated as alive)', () => {
    const result = evaluateEligibility({
      state: makeState(),
      session: makeSession(),
      worktreeExists: true,
      ageDays: 0,
      ...defaults(),
      isProcessAlive: () => false,
      socketExists: () => true,
    });
    expect(result).toEqual({ eligible: false, reason: 'shellper_alive' });
  });

  it('skips when worktree is missing', () => {
    const result = evaluateEligibility({
      state: makeState(),
      session: makeSession(),
      worktreeExists: false,
      ageDays: 0,
      ...defaults(),
    });
    expect(result).toEqual({ eligible: false, reason: 'worktree_missing' });
  });

  it('skips stale projects when --include-stale not set', () => {
    const result = evaluateEligibility({
      state: makeState(),
      session: makeSession(),
      worktreeExists: true,
      ageDays: 30,
      ...defaults(),
    });
    expect(result).toEqual({ eligible: false, reason: 'stale' });
  });

  it('honors --include-stale on otherwise-stale projects', () => {
    const result = evaluateEligibility({
      state: makeState(),
      session: makeSession(),
      worktreeExists: true,
      ageDays: 30,
      ...defaults(),
      includeStale: true,
    });
    expect(result).toEqual({ eligible: true });
  });

  it('returns eligible when all conditions are met', () => {
    const result = evaluateEligibility({
      state: makeState(),
      session: makeSession(),
      worktreeExists: true,
      ageDays: 2,
      ...defaults(),
    });
    expect(result).toEqual({ eligible: true });
  });

  it('checks predicates in cheap-first order (terminal beats missing session)', () => {
    const result = evaluateEligibility({
      state: makeState({ phase: 'verified' }),
      session: null,
      worktreeExists: false,
      ageDays: 999,
      ...defaults(),
    });
    expect(result).toEqual({ eligible: false, reason: 'terminal' });
  });
});

describe('deriveBuilderInfo', () => {
  it('maps SPIR state to builder-spir-<stripped-id>', () => {
    expect(deriveBuilderInfo(makeState({ id: '0087', protocol: 'spir' }))).toEqual({
      builderId: 'builder-spir-87',
      issueArg: '87',
      cliProtocol: 'spir',
    });
  });

  it('aliases protocol: spider → spir for both builderId and CLI invocation', () => {
    expect(deriveBuilderInfo(makeState({ id: '0092', protocol: 'spider' }))).toEqual({
      builderId: 'builder-spir-92',
      issueArg: '92',
      cliProtocol: 'spir',
    });
  });

  it('handles bugfix project IDs (bugfix-693 → builder-bugfix-693, issue 693)', () => {
    expect(deriveBuilderInfo(makeState({ id: 'bugfix-693', protocol: 'bugfix' }))).toEqual({
      builderId: 'builder-bugfix-693',
      issueArg: '693',
      cliProtocol: 'bugfix',
    });
  });

  it('handles PIR projects', () => {
    expect(deriveBuilderInfo(makeState({ id: '0829', protocol: 'pir' }))).toEqual({
      builderId: 'builder-pir-829',
      issueArg: '829',
      cliProtocol: 'pir',
    });
  });

  it('handles ASPIR projects', () => {
    expect(deriveBuilderInfo(makeState({ id: '0438', protocol: 'aspir' }))).toEqual({
      builderId: 'builder-aspir-438',
      issueArg: '438',
      cliProtocol: 'aspir',
    });
  });

  it('handles AIR projects', () => {
    expect(deriveBuilderInfo(makeState({ id: '0501', protocol: 'air' }))).toEqual({
      builderId: 'builder-air-501',
      issueArg: '501',
      cliProtocol: 'air',
    });
  });
});

describe('resolveWorktreePath', () => {
  let tmp: string;
  let buildersDir: string;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'recover-test-'));
    buildersDir = join(tmp, '.builders');
    mkdirSync(buildersDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  it('finds ID-only worktree (Spec 653 layout)', () => {
    const wt = join(buildersDir, 'spir-87');
    mkdirSync(join(wt, '.git'), { recursive: true });
    const result = resolveWorktreePath(buildersDir, makeState({ id: '0087', protocol: 'spir' }));
    expect(result).toBe(wt);
  });

  it('falls back to legacy title-suffixed worktree', () => {
    const wt = join(buildersDir, 'spir-87-some-title-slug');
    mkdirSync(join(wt, '.git'), { recursive: true });
    const result = resolveWorktreePath(buildersDir, makeState({ id: '0087', protocol: 'spir' }));
    expect(result).toBe(wt);
  });

  it('returns null when no worktree matches', () => {
    const result = resolveWorktreePath(buildersDir, makeState({ id: '0087', protocol: 'spir' }));
    expect(result).toBeNull();
  });

  it('ignores directories with the right prefix but no .git', () => {
    mkdirSync(join(buildersDir, 'spir-87'), { recursive: true });
    const result = resolveWorktreePath(buildersDir, makeState({ id: '0087', protocol: 'spir' }));
    expect(result).toBeNull();
  });

  it('resolves bugfix worktree by issue number', () => {
    const wt = join(buildersDir, 'bugfix-693');
    mkdirSync(join(wt, '.git'), { recursive: true });
    const result = resolveWorktreePath(buildersDir, makeState({ id: 'bugfix-693', protocol: 'bugfix' }));
    expect(result).toBe(wt);
  });
});

describe('listAllProjects (precedence)', () => {
  let tmp: string;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'recover-list-'));
  });

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  function writeStatus(dir: string, state: Partial<ProjectState>): void {
    mkdirSync(dir, { recursive: true });
    const full = { ...makeState(state) };
    const yaml = [
      `id: '${full.id}'`,
      `title: '${full.title}'`,
      `protocol: ${full.protocol}`,
      `phase: ${full.phase}`,
      'plan_phases: []',
      'current_plan_phase: null',
      'gates: {}',
      `iteration: ${full.iteration}`,
      `build_complete: ${full.build_complete}`,
      'history: []',
      `started_at: '${full.started_at}'`,
      `updated_at: '${full.updated_at}'`,
    ].join('\n');
    writeFileSync(join(dir, 'status.yaml'), yaml + '\n', 'utf-8');
  }

  it('returns projects from codev/projects when no .builders copy exists', () => {
    writeStatus(join(tmp, 'codev', 'projects', '0087-foo'), { id: '0087', phase: 'implement' });
    const result = listAllProjects(tmp);
    expect(result).toHaveLength(1);
    expect(result[0].state.id).toBe('0087');
    expect(result[0].statusPath).toBe(join(tmp, 'codev', 'projects', '0087-foo', 'status.yaml'));
  });

  it('prefers .builders/ copy when same project id exists in both', () => {
    writeStatus(join(tmp, 'codev', 'projects', '0087-foo'), { id: '0087', phase: 'specify' });
    writeStatus(
      join(tmp, '.builders', 'spir-87', 'codev', 'projects', '0087-foo'),
      { id: '0087', phase: 'review' },
    );
    const result = listAllProjects(tmp);
    expect(result).toHaveLength(1);
    expect(result[0].state.phase).toBe('review');
    expect(result[0].statusPath).toContain('.builders');
  });

  it('returns empty array for a workspace with no projects', () => {
    expect(listAllProjects(tmp)).toEqual([]);
  });

  it('skips unparseable status.yaml files', () => {
    const dir = join(tmp, 'codev', 'projects', '0099-broken');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'status.yaml'), 'this is: not\n  valid:\nyaml: [\n', 'utf-8');
    writeStatus(join(tmp, 'codev', 'projects', '0087-foo'), { id: '0087' });
    const result = listAllProjects(tmp);
    expect(result).toHaveLength(1);
    expect(result[0].state.id).toBe('0087');
  });
});

describe('formatRelativeAge', () => {
  it('formats minutes', () => {
    const iso = new Date(Date.now() - 30 * 60_000).toISOString();
    expect(formatRelativeAge(iso)).toMatch(/^\d+m ago$/);
  });

  it('formats hours', () => {
    const iso = new Date(Date.now() - 3 * 3600_000).toISOString();
    expect(formatRelativeAge(iso)).toMatch(/^\d+h ago$/);
  });

  it('formats days', () => {
    const iso = new Date(Date.now() - 5 * 86_400_000).toISOString();
    expect(formatRelativeAge(iso)).toMatch(/^\d+d ago$/);
  });

  it('returns placeholder for malformed ISO', () => {
    expect(formatRelativeAge('not a date')).toBe('—');
  });
});
