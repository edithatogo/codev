/**
 * Tests for state management with SQLite
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { LOCAL_SCHEMA, GLOBAL_SCHEMA } from '../db/schema.js';

// Test directory
const testDir = resolve(process.cwd(), '.test-state');
let testDb: Database.Database;
let testGlobalDb: Database.Database;

// Mock the db module to use test database
vi.mock('../db/index.js', () => {
  return {
    getDb: () => {
      if (!testDb) {
        testDb = new Database(resolve(testDir, 'state.db'));
        testDb.pragma('journal_mode = WAL');
        testDb.pragma('busy_timeout = 5000');
        testDb.exec(LOCAL_SCHEMA);
        testDb.prepare('INSERT OR IGNORE INTO _migrations (version) VALUES (1)').run();
      }
      return testDb;
    },
    getGlobalDb: () => {
      if (!testGlobalDb) {
        testGlobalDb = new Database(resolve(testDir, 'global.db'));
        testGlobalDb.pragma('journal_mode = WAL');
        testGlobalDb.pragma('busy_timeout = 5000');
        testGlobalDb.exec(GLOBAL_SCHEMA);
      }
      return testGlobalDb;
    },
    closeDb: () => {
      if (testDb) {
        testDb.close();
        testDb = null as any;
      }
    },
  };
});

// Import after mocking
const state = await import('../state.js');

describe('State Management', () => {
  beforeEach(() => {
    // Clean up before each test
    if (testDb) {
      testDb.close();
      testDb = null as any;
    }
    if (testGlobalDb) {
      testGlobalDb.close();
      testGlobalDb = null as any;
    }
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true });
    }
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    if (testDb) {
      testDb.close();
      testDb = null as any;
    }
    if (testGlobalDb) {
      testGlobalDb.close();
      testGlobalDb = null as any;
    }
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true });
    }
  });

  describe('loadState', () => {
    it('should return default state when database is empty', () => {
      const result = state.loadState();

      // Spec 786 Phase 5: loadState now returns `architects: []` alongside the
      // scalar `architect` shim (empty array when no rows in state.db.architect).
      expect(result).toEqual({
        architect: null,
        architects: [],
        builders: [],
        utils: [],
        annotations: [],
      });
    });

    // Spec 786 Phase 5: loadState populates `architects` with `main` first.
    it('returns architects collection with main first then siblings by started_at', () => {
      // Insert in a deliberately scrambled order: a sibling first, then main,
      // then another sibling. loadState must sort main to position 0.
      state.setArchitectByName('ob-refine', {
        name: 'ob-refine',
        cmd: 'claude',
        startedAt: '2026-05-22T10:00:00Z',
        terminalId: 'term-ob',
      });
      state.setArchitect({
        cmd: 'claude',
        startedAt: '2026-05-22T11:00:00Z',
        terminalId: 'term-main',
      });
      state.setArchitectByName('architect-3', {
        name: 'architect-3',
        cmd: 'claude',
        startedAt: '2026-05-22T12:00:00Z',
        terminalId: 'term-a3',
      });

      const result = state.loadState();
      expect(result.architects).toHaveLength(3);
      expect(result.architects[0].name).toBe('main');
      // Siblings in started_at order (ob-refine before architect-3).
      expect(result.architects[1].name).toBe('ob-refine');
      expect(result.architects[2].name).toBe('architect-3');
    });

    it('scalar `architect` shim points at architects[0] for backward-compat', () => {
      // With only a sibling registered (no main row), the scalar shim points
      // at the sibling (architects[0]) — preserving the Spec 755 fallback.
      state.setArchitectByName('ob-refine', {
        name: 'ob-refine',
        cmd: 'claude',
        startedAt: '2026-05-22T10:00:00Z',
      });

      const result = state.loadState();
      expect(result.architects).toHaveLength(1);
      expect(result.architects[0].name).toBe('ob-refine');
      expect(result.architect?.name).toBe('ob-refine');
    });
  });

  describe('setArchitect', () => {
    it('should set architect state', () => {
      const architect = {
        cmd: 'claude',
        startedAt: new Date().toISOString(),
      };

      state.setArchitect(architect);

      const result = state.loadState();
      expect(result.architect?.cmd).toBe('claude');
    });

    it('should clear architect when set to null', () => {
      // Set architect first
      state.setArchitect({
        cmd: 'claude',
        startedAt: new Date().toISOString(),
      });

      // Then clear it
      state.setArchitect(null);

      const result = state.loadState();
      expect(result.architect).toBeNull();
    });

    it('should replace existing architect (singleton)', () => {
      state.setArchitect({
        cmd: 'claude',
        startedAt: new Date().toISOString(),
      });

      state.setArchitect({
        cmd: 'claude --dangerously-skip-permissions',
        startedAt: new Date().toISOString(),
      });

      const result = state.loadState();
      expect(result.architect?.cmd).toBe('claude --dangerously-skip-permissions');
    });
  });

  describe('upsertBuilder', () => {
    it('should add new builder', () => {
      const builder = {
        id: 'B001',
        name: 'test-builder',
        status: 'implementing' as const,
        phase: 'init',
        worktree: '/tmp/worktree',
        branch: 'feature-branch',
        type: 'spec' as const,
      };

      state.upsertBuilder(builder);

      const result = state.loadState();
      expect(result.builders).toHaveLength(1);
      expect(result.builders[0].id).toBe('B001');
      expect(result.builders[0].status).toBe('implementing');
    });

    it('should update existing builder', () => {
      const builder = {
        id: 'B001',
        name: 'test-builder',
        status: 'implementing' as const,
        phase: 'init',
        worktree: '/tmp/worktree',
        branch: 'feature-branch',
        type: 'spec' as const,
      };

      state.upsertBuilder(builder);

      // Update status
      state.upsertBuilder({ ...builder, status: 'blocked' });

      const result = state.loadState();
      expect(result.builders).toHaveLength(1);
      expect(result.builders[0].status).toBe('blocked');
    });

    // Spec 755 Phase 2: spawnedByArchitect persistence.
    it('persists spawnedByArchitect when supplied', () => {
      state.upsertBuilder({
        id: 'B-spec755',
        name: 'test-builder',
        status: 'implementing' as const,
        phase: 'init',
        worktree: '/tmp/worktree',
        branch: 'feature-branch',
        type: 'spec' as const,
        spawnedByArchitect: 'sibling',
      });

      const row = state.getBuilder('B-spec755');
      expect(row?.spawnedByArchitect).toBe('sibling');
    });

    it('preserves spawnedByArchitect across re-upserts (COALESCE)', () => {
      // First insert with an explicit architect name.
      state.upsertBuilder({
        id: 'B-spec755',
        name: 'test-builder',
        status: 'implementing' as const,
        phase: 'init',
        worktree: '/tmp/worktree',
        branch: 'feature-branch',
        type: 'spec' as const,
        spawnedByArchitect: 'sibling',
      });

      // Subsequent status update without spawnedByArchitect must NOT clobber
      // the persisted name. The SQL uses COALESCE to preserve it.
      state.upsertBuilder({
        id: 'B-spec755',
        name: 'test-builder',
        status: 'blocked' as const,
        phase: 'review',
        worktree: '/tmp/worktree',
        branch: 'feature-branch',
        type: 'spec' as const,
        // spawnedByArchitect intentionally omitted.
      });

      const row = state.getBuilder('B-spec755');
      expect(row?.status).toBe('blocked');
      expect(row?.spawnedByArchitect).toBe('sibling');
    });

    it('leaves spawnedByArchitect null for legacy upserts that never supplied it', () => {
      state.upsertBuilder({
        id: 'B-spec755-legacy',
        name: 'test-builder',
        status: 'implementing' as const,
        phase: 'init',
        worktree: '/tmp/worktree',
        branch: 'feature-branch',
        type: 'spec' as const,
      });

      const row = state.getBuilder('B-spec755-legacy');
      expect(row?.spawnedByArchitect).toBeUndefined();
    });
  });

  describe('removeBuilder', () => {
    it('should remove builder by id', () => {
      state.upsertBuilder({
        id: 'B001',
        name: 'test-builder',
        status: 'implementing' as const,
        phase: 'init',
        worktree: '/tmp/worktree',
        branch: 'feature-branch',
        type: 'spec' as const,
      });

      state.removeBuilder('B001');

      const result = state.loadState();
      expect(result.builders).toHaveLength(0);
    });
  });

  describe('getBuilder', () => {
    it('should return builder by id', () => {
      state.upsertBuilder({
        id: 'B001',
        name: 'test-builder',
        status: 'implementing' as const,
        phase: 'init',
        worktree: '/tmp/worktree',
        branch: 'feature-branch',
        type: 'spec' as const,
      });

      const builder = state.getBuilder('B001');
      expect(builder?.id).toBe('B001');
    });

    it('should return null for non-existent builder', () => {
      const builder = state.getBuilder('B999');
      expect(builder).toBeNull();
    });
  });

  describe('addUtil / removeUtil', () => {
    it('should add and remove utility terminals', () => {
      const util = {
        id: 'U001',
        name: 'test-util',
      };

      state.addUtil(util);

      let result = state.loadState();
      expect(result.utils).toHaveLength(1);
      expect(result.utils[0].id).toBe('U001');

      state.removeUtil('U001');

      result = state.loadState();
      expect(result.utils).toHaveLength(0);
    });
  });

  describe('addAnnotation / removeAnnotation', () => {
    it('should add and remove annotations', () => {
      const annotation = {
        id: 'A001',
        file: '/path/to/file.ts',
        parent: {
          type: 'architect' as const,
        },
      };

      state.addAnnotation(annotation);

      let result = state.loadState();
      expect(result.annotations).toHaveLength(1);
      expect(result.annotations[0].file).toBe('/path/to/file.ts');

      state.removeAnnotation('A001');

      result = state.loadState();
      expect(result.annotations).toHaveLength(0);
    });
  });

  describe('clearState', () => {
    it('should reset all state', () => {
      // Add some state
      state.setArchitect({
        cmd: 'claude',
        startedAt: new Date().toISOString(),
      });

      state.upsertBuilder({
        id: 'B001',
        name: 'test-builder',
        status: 'implementing' as const,
        phase: 'init',
        worktree: '/tmp/worktree',
        branch: 'feature-branch',
        type: 'spec' as const,
      });

      // Clear it
      state.clearState();

      const result = state.loadState();
      // Spec 786 Phase 5: loadState now returns `architects: []` alongside the
      // scalar `architect` shim (empty array when no rows in state.db.architect).
      expect(result).toEqual({
        architect: null,
        architects: [],
        builders: [],
        utils: [],
        annotations: [],
      });
    });
  });

  // Spec 786 Phase 1: removeArchitect helper and clearRuntime variant.
  describe('removeArchitect (Spec 786)', () => {
    it('removes a named architect row from state.db', () => {
      state.setArchitectByName('ob-refine', {
        name: 'ob-refine',
        cmd: 'claude',
        startedAt: new Date().toISOString(),
        terminalId: 'term-1',
      });
      // Confirm it was inserted
      let architects = state.getArchitects();
      expect(architects.some(a => a.name === 'ob-refine')).toBe(true);

      state.removeArchitect('ob-refine');

      architects = state.getArchitects();
      expect(architects.some(a => a.name === 'ob-refine')).toBe(false);
    });

    it('is idempotent — removing a non-existent name is a no-op', () => {
      expect(() => state.removeArchitect('nonexistent')).not.toThrow();
    });

    it('does not affect other architects', () => {
      state.setArchitect({
        cmd: 'claude',
        startedAt: new Date().toISOString(),
        terminalId: 'main-term',
      });
      state.setArchitectByName('ob-refine', {
        name: 'ob-refine',
        cmd: 'claude',
        startedAt: new Date().toISOString(),
        terminalId: 'sibling-term',
      });

      state.removeArchitect('ob-refine');

      const architects = state.getArchitects();
      expect(architects.some(a => a.name === 'main')).toBe(true);
      expect(architects.some(a => a.name === 'ob-refine')).toBe(false);
    });
  });

  describe('clearRuntime (Spec 786)', () => {
    it('preserves all architect rows while wiping runtime tables', () => {
      // Set up: main + a sibling + a builder + a util + an annotation
      state.setArchitect({
        cmd: 'claude',
        startedAt: new Date().toISOString(),
        terminalId: 'main-term',
      });
      state.setArchitectByName('ob-refine', {
        name: 'ob-refine',
        cmd: 'claude',
        startedAt: new Date().toISOString(),
        terminalId: 'sibling-term',
      });
      state.upsertBuilder({
        id: 'B001',
        name: 'test-builder',
        status: 'implementing' as const,
        phase: 'init',
        worktree: '/tmp/worktree',
        branch: 'feature-branch',
        type: 'spec' as const,
      });

      state.clearRuntime();

      // Architects survive
      const architects = state.getArchitects();
      expect(architects).toHaveLength(2);
      expect(architects.some(a => a.name === 'main')).toBe(true);
      expect(architects.some(a => a.name === 'ob-refine')).toBe(true);

      // Builders are gone
      const result = state.loadState();
      expect(result.builders).toEqual([]);
      expect(result.utils).toEqual([]);
      expect(result.annotations).toEqual([]);
    });

    it('differs from clearState which wipes architects too', () => {
      // Confirm the differential behaviour: clearState removes architects;
      // clearRuntime preserves them.
      state.setArchitect({
        cmd: 'claude',
        startedAt: new Date().toISOString(),
      });
      state.setArchitectByName('ob-refine', {
        name: 'ob-refine',
        cmd: 'claude',
        startedAt: new Date().toISOString(),
      });

      state.clearState();

      const architectsAfterClear = state.getArchitects();
      expect(architectsAfterClear).toHaveLength(0);
    });
  });

  // ===========================================================================
  // Bugfix #826 — getArchitectsForWorkspace
  // ===========================================================================
  //
  // Returns architects from state.db.architect whose role_id appears in a
  // terminal_sessions row matching `workspace_path = <given path>` with
  // `type = 'architect'`. Used by launchInstance's sibling reconcile loop to
  // avoid leaking architects registered in one workspace into another.

  describe('getArchitectsForWorkspace (Bugfix #826)', () => {
    function insertTerminalSession(
      id: string,
      workspacePath: string,
      type: 'architect' | 'builder' | 'shell',
      roleId: string | null,
    ): void {
      // Prime testGlobalDb lazily through the mock if it hasn't been touched.
      if (!testGlobalDb) {
        state.getArchitectsForWorkspace('/tmp/__init__');
      }
      testGlobalDb!
        .prepare(
          `INSERT INTO terminal_sessions (id, workspace_path, type, role_id, pid)
           VALUES (?, ?, ?, ?, ?)`
        )
        .run(id, workspacePath, type, roleId, 1234);
    }

    it('returns empty when no terminal_sessions match the workspace', () => {
      state.setArchitectByName('ob-refine', {
        name: 'ob-refine',
        cmd: 'claude',
        startedAt: '2026-05-23T10:00:00Z',
      });

      const result = state.getArchitectsForWorkspace('/some/workspace');
      expect(result).toEqual([]);
    });

    it('returns only architects whose terminal_sessions row matches workspace_path', () => {
      // Two architects in state.db: main (belongs to workspace A) and
      // ob-refine (belongs to workspace A). Plus bug-backlog in state.db but
      // its terminal_sessions row is for workspace B.
      state.setArchitect({
        cmd: 'claude',
        startedAt: '2026-05-23T10:00:00Z',
      });
      state.setArchitectByName('ob-refine', {
        name: 'ob-refine',
        cmd: 'claude',
        startedAt: '2026-05-23T10:05:00Z',
      });
      state.setArchitectByName('bug-backlog', {
        name: 'bug-backlog',
        cmd: 'claude',
        startedAt: '2026-05-23T10:10:00Z',
      });

      insertTerminalSession('t1', '/workspace/A', 'architect', 'main');
      insertTerminalSession('t2', '/workspace/A', 'architect', 'ob-refine');
      insertTerminalSession('t3', '/workspace/B', 'architect', 'bug-backlog');

      const archA = state.getArchitectsForWorkspace('/workspace/A');
      const archB = state.getArchitectsForWorkspace('/workspace/B');
      const namesA = archA.map(a => a.name).sort();
      const namesB = archB.map(a => a.name).sort();

      expect(namesA).toEqual(['main', 'ob-refine']);
      expect(namesB).toEqual(['bug-backlog']);
    });

    it('regression: leaked architect in state.db is NOT returned for an unrelated workspace', () => {
      // The bug scenario from issue #826: shannon registered ob-refine, leaking
      // a row into state.db.architect. The user then opens manazil (which has
      // no terminal_sessions rows for these architects). Pre-fix, the launch
      // reconcile would re-spawn ob-refine into manazil. With this filter,
      // ob-refine is correctly excluded for manazil.
      state.setArchitectByName('ob-refine', {
        name: 'ob-refine',
        cmd: 'claude',
        startedAt: '2026-05-23T10:00:00Z',
      });
      insertTerminalSession('t-shannon', '/shannon', 'architect', 'ob-refine');

      const manazil = state.getArchitectsForWorkspace('/manazil');
      expect(manazil).toEqual([]);
    });

    it('ignores non-architect terminal_sessions rows', () => {
      state.setArchitectByName('ob-refine', {
        name: 'ob-refine',
        cmd: 'claude',
        startedAt: '2026-05-23T10:00:00Z',
      });
      // A builder terminal that happens to share a workspace_path shouldn't
      // pull a same-named state.db.architect row into the result.
      insertTerminalSession('t-builder', '/workspace/A', 'builder', 'ob-refine');

      const result = state.getArchitectsForWorkspace('/workspace/A');
      expect(result).toEqual([]);
    });

    it('returns only architects that also exist in state.db.architect', () => {
      // terminal_sessions has a row for an architect name with no matching
      // state.db.architect row (e.g., the architect row was deleted but the
      // terminal_sessions row lingers). Should not be returned.
      insertTerminalSession('t-orphan', '/workspace/A', 'architect', 'orphan-arch');

      const result = state.getArchitectsForWorkspace('/workspace/A');
      expect(result).toEqual([]);
    });
  });

  // ===========================================================================
  // Bugfix #826 — stop+start lifecycle integration contract
  // ===========================================================================
  //
  // Codex's independent CMAP flagged that a literal Option B (filter-only) fix
  // regresses Spec 786's stop+start sibling persistence: terminal_sessions is
  // wiped on workspace stop, so on next launch the workspace_path signal that
  // getArchitectsForWorkspace joins on is gone and siblings aren't restored.
  //
  // The full fix (Option B+) preserves architect rows in BOTH tables on
  // intentional stop. This test exercises that lifecycle end-to-end using real
  // SQLite to lock in the integration contract that purely-unit tests
  // (vi.fn-based mocks) miss.

  describe('Bugfix #826: stop+start lifecycle integration contract', () => {
    function deleteWorkspaceNonArchitectRows(workspacePath: string): void {
      // Mirrors the new deleteWorkspaceTerminalSessions(workspacePath) default
      // (no opt-in to wipe architects). See tower-terminals.ts.
      if (!testGlobalDb) state.getArchitectsForWorkspace('/tmp/__init__');
      testGlobalDb!
        .prepare(
          "DELETE FROM terminal_sessions WHERE workspace_path = ? AND type != 'architect'"
        )
        .run(workspacePath);
    }

    function saveArchitectTerminalSession(
      terminalId: string,
      workspacePath: string,
      roleId: string,
    ): void {
      // Mirrors saveTerminalSession's architect-uniqueness invariant: a
      // pre-delete by (workspace_path, role_id) before insert, so stale rows
      // from prior stop+start cycles don't accumulate.
      if (!testGlobalDb) state.getArchitectsForWorkspace('/tmp/__init__');
      testGlobalDb!
        .prepare(
          "DELETE FROM terminal_sessions WHERE workspace_path = ? AND type = 'architect' AND role_id = ?"
        )
        .run(workspacePath, roleId);
      testGlobalDb!
        .prepare(
          `INSERT INTO terminal_sessions (id, workspace_path, type, role_id, pid)
           VALUES (?, ?, ?, ?, ?)`
        )
        .run(terminalId, workspacePath, 'architect', roleId, 1234);
    }

    function saveBuilderTerminalSession(
      terminalId: string,
      workspacePath: string,
      roleId: string,
    ): void {
      if (!testGlobalDb) state.getArchitectsForWorkspace('/tmp/__init__');
      testGlobalDb!
        .prepare(
          `INSERT INTO terminal_sessions (id, workspace_path, type, role_id, pid)
           VALUES (?, ?, ?, ?, ?)`
        )
        .run(terminalId, workspacePath, 'builder', roleId, 5678);
    }

    function countArchitectRows(workspacePath: string, roleId: string): number {
      if (!testGlobalDb) state.getArchitectsForWorkspace('/tmp/__init__');
      const result = testGlobalDb!
        .prepare(
          "SELECT COUNT(*) AS n FROM terminal_sessions WHERE workspace_path = ? AND type = 'architect' AND role_id = ?"
        )
        .get(workspacePath, roleId) as { n: number };
      return result.n;
    }

    function countAllRows(workspacePath: string): { architect: number; builder: number; shell: number } {
      if (!testGlobalDb) state.getArchitectsForWorkspace('/tmp/__init__');
      const a = testGlobalDb!
        .prepare("SELECT COUNT(*) AS n FROM terminal_sessions WHERE workspace_path = ? AND type = 'architect'")
        .get(workspacePath) as { n: number };
      const b = testGlobalDb!
        .prepare("SELECT COUNT(*) AS n FROM terminal_sessions WHERE workspace_path = ? AND type = 'builder'")
        .get(workspacePath) as { n: number };
      const s = testGlobalDb!
        .prepare("SELECT COUNT(*) AS n FROM terminal_sessions WHERE workspace_path = ? AND type = 'shell'")
        .get(workspacePath) as { n: number };
      return { architect: a.n, builder: b.n, shell: s.n };
    }

    it('preserves architect rows in BOTH state.db and terminal_sessions across stop+start', () => {
      const WS = '/workspace/shannon';

      // ===== Initial launch =====
      // main + ob-refine architects, plus a builder PTY.
      state.setArchitect({ cmd: 'claude', startedAt: '2026-05-23T10:00:00Z' });
      state.setArchitectByName('ob-refine', {
        name: 'ob-refine',
        cmd: 'claude',
        startedAt: '2026-05-23T10:05:00Z',
      });
      saveArchitectTerminalSession('arch-main-v1', WS, 'main');
      saveArchitectTerminalSession('arch-sibling-v1', WS, 'ob-refine');
      saveBuilderTerminalSession('builder-1', WS, 'b001');

      // Sanity: both architects + builder present.
      expect(countAllRows(WS)).toEqual({ architect: 2, builder: 1, shell: 0 });
      expect(state.getArchitectsForWorkspace(WS).map(a => a.name).sort()).toEqual(['main', 'ob-refine']);

      // ===== Intentional stop =====
      // The architect exit handlers skip both deleteTerminalSession AND
      // setArchitectByName(null) when intentionally stopping (Bugfix #826).
      // The bulk wipe also skips architect rows. Builder rows go.
      deleteWorkspaceNonArchitectRows(WS);

      // Architect rows in BOTH tables MUST survive.
      expect(state.getArchitects().map(a => a.name).sort()).toEqual(['main', 'ob-refine']);
      expect(countAllRows(WS)).toEqual({ architect: 2, builder: 0, shell: 0 });

      // The workspace_path signal for getArchitectsForWorkspace is alive.
      expect(state.getArchitectsForWorkspace(WS).map(a => a.name).sort()).toEqual(['main', 'ob-refine']);

      // ===== Restart: fresh main spawn, reconcile re-spawns sibling =====
      // launchInstance creates a NEW 'main' PTY (new terminal id). The new
      // saveTerminalSession pre-deletes the stale 'main' row before inserting
      // — so no stale row accumulates.
      saveArchitectTerminalSession('arch-main-v2', WS, 'main');
      expect(countArchitectRows(WS, 'main')).toBe(1);

      // The reconcile loop reads getArchitectsForWorkspace(WS) and re-spawns
      // ob-refine. Simulate that addArchitect call's saveTerminalSession.
      saveArchitectTerminalSession('arch-sibling-v2', WS, 'ob-refine');
      expect(countArchitectRows(WS, 'ob-refine')).toBe(1);

      // Final state: clean — one row per architect per workspace.
      expect(countAllRows(WS)).toEqual({ architect: 2, builder: 0, shell: 0 });
    });

    it('does NOT leak architects across workspaces during the same lifecycle (the #826 root cause)', () => {
      const SHANNON = '/workspace/shannon';
      const MANAZIL = '/workspace/manazil';

      // Shannon registers a sibling.
      state.setArchitectByName('ob-refine', {
        name: 'ob-refine',
        cmd: 'claude',
        startedAt: '2026-05-23T10:00:00Z',
      });
      saveArchitectTerminalSession('arch-shannon-sibling', SHANNON, 'ob-refine');

      // User opens manazil — launchInstance(MANAZIL) runs the reconcile loop.
      // The bug was: getArchitects() returned ob-refine from the global table
      // and addArchitect(MANAZIL, 'ob-refine') re-spawned it into manazil.
      const manazilArchitects = state.getArchitectsForWorkspace(MANAZIL);
      expect(manazilArchitects).toEqual([]);

      // Shannon still sees its own sibling.
      const shannonArchitects = state.getArchitectsForWorkspace(SHANNON);
      expect(shannonArchitects.map(a => a.name)).toEqual(['ob-refine']);
    });

    it('handles multiple stop+start cycles without accumulating stale rows', () => {
      const WS = '/workspace/W';
      state.setArchitect({ cmd: 'claude', startedAt: '2026-05-23T10:00:00Z' });
      state.setArchitectByName('ob-refine', {
        name: 'ob-refine',
        cmd: 'claude',
        startedAt: '2026-05-23T10:05:00Z',
      });

      for (let cycle = 1; cycle <= 3; cycle++) {
        // Launch: fresh PTYs.
        saveArchitectTerminalSession(`arch-main-c${cycle}`, WS, 'main');
        saveArchitectTerminalSession(`arch-sibling-c${cycle}`, WS, 'ob-refine');
        saveBuilderTerminalSession(`builder-c${cycle}`, WS, `b${cycle}`);

        // Stop (preserve architect rows).
        deleteWorkspaceNonArchitectRows(WS);

        // After every cycle: exactly one row per architect.
        expect(countArchitectRows(WS, 'main')).toBe(1);
        expect(countArchitectRows(WS, 'ob-refine')).toBe(1);
        expect(countAllRows(WS).builder).toBe(0);

        // And the workspace_path signal is intact.
        expect(state.getArchitectsForWorkspace(WS).map(a => a.name).sort()).toEqual(['main', 'ob-refine']);
      }
    });
  });
});
