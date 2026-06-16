/**
 * Tests for `afx status` architect↔builder ownership surfacing (Spec 1057 / #1057).
 *
 * Covers:
 *   - the `Owner` column + owner sort in the human builder table,
 *   - the `--architect <name>` and `--mine` ownership filters,
 *   - the `--json` machine-readable payload (carries `spawnedByArchitect`),
 *   - the `currentArchitectName` env resolver used by `--mine`.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { currentArchitectName } from '../utils/architect-name.js';

// ============================================================================
// Mocks (mirror status-naming.test.ts so both suites coexist)
// ============================================================================

const mockLoadState = vi.fn();
const mockIsRunning = vi.fn();
const mockGetHealth = vi.fn();
const mockGetWorkspaceStatus = vi.fn();
const mockLoggerRow = vi.fn();
const mockLoggerInfo = vi.fn();

vi.mock('../utils/config.js', () => ({
  getConfig: vi.fn(() => ({ workspaceRoot: '/fake/workspace' })),
}));

vi.mock('../state.js', () => ({
  loadState: (...args: any[]) => mockLoadState(...args),
}));

vi.mock('../lib/tower-client.js', () => ({
  getTowerClient: () => ({
    isRunning: (...a: any[]) => mockIsRunning(...a),
    getHealth: (...a: any[]) => mockGetHealth(...a),
    getWorkspaceStatus: (...a: any[]) => mockGetWorkspaceStatus(...a),
  }),
}));

vi.mock('../../lib/config.js', () => ({
  loadConfig: vi.fn(() => ({})),
}));

vi.mock('../utils/logger.js', () => ({
  logger: {
    header: vi.fn(),
    success: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    info: (...args: any[]) => mockLoggerInfo(...args),
    kv: vi.fn(),
    blank: vi.fn(),
    row: (...args: any[]) => mockLoggerRow(...args),
  },
  fatal: vi.fn((msg: string) => { throw new Error(msg); }),
}));

import { status } from '../commands/status.js';

// Strip ANSI color codes so assertions are robust regardless of chalk level.
// eslint-disable-next-line no-control-regex
const stripAnsi = (s: string) => s.replace(/\[[0-9;]*m/g, '');

function builder(id: string, owner: string | undefined, extra: Record<string, any> = {}) {
  return {
    id,
    name: id.replace(/^builder-/, ''),
    type: 'spec',
    status: 'implementing',
    phase: 'impl',
    worktree: `/project/.builders/${id}`,
    branch: `builder/${id}`,
    terminalId: `term-${id}`,
    spawnedByArchitect: owner,
    ...extra,
  };
}

/** Return the data rows (cols arrays) of the builder table, ANSI-stripped. */
function builderDataRows() {
  return mockLoggerRow.mock.calls
    .map((call: any[]) => call[0] as string[])
    .filter((cols) => Array.isArray(cols) && cols[0] !== 'ID' && cols[0] !== '──')
    .map((cols) => cols.map((c) => stripAnsi(String(c))));
}

// ============================================================================
// currentArchitectName (unit)
// ============================================================================

describe('currentArchitectName (Spec 1057)', () => {
  it('returns CODEV_ARCHITECT_NAME when set', () => {
    expect(currentArchitectName({ CODEV_ARCHITECT_NAME: 'feedback' } as any)).toBe('feedback');
  });

  it('trims surrounding whitespace', () => {
    expect(currentArchitectName({ CODEV_ARCHITECT_NAME: '  reflection  ' } as any)).toBe('reflection');
  });

  it("defaults to 'main' when unset or blank", () => {
    expect(currentArchitectName({} as any)).toBe('main');
    expect(currentArchitectName({ CODEV_ARCHITECT_NAME: '   ' } as any)).toBe('main');
  });
});

// ============================================================================
// Human table: Owner column + sort + filters (Tower-down path)
// ============================================================================

describe('afx status — owner column & filters (Spec 1057)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsRunning.mockResolvedValue(false); // legacy/local display
    mockLoadState.mockReturnValue({
      architect: null,
      architects: [],
      builders: [
        builder('builder-b', 'zeta'),
        builder('builder-a', 'alpha'),
        builder('builder-c', undefined), // legacy / unknown owner
      ],
      utils: [],
      annotations: [],
    });
  });

  it('adds an Owner column (ID stays first) to the builder table', async () => {
    await status();

    const header = mockLoggerRow.mock.calls
      .map((c: any[]) => c[0] as string[])
      .find((cols) => Array.isArray(cols) && cols[0] === 'ID');
    expect(header).toBeDefined();
    expect(header![0]).toBe('ID');
    expect(header![1]).toBe('Owner');
  });

  it('sorts builders by owner, unknown owner last', async () => {
    await status();

    const rows = builderDataRows();
    expect(rows.map((r) => r[0])).toEqual(['builder-a', 'builder-b', 'builder-c']);
    // Owner cell carries the spawning architect; unknown shows the placeholder.
    expect(rows[0][1]).toBe('alpha');
    expect(rows[1][1]).toBe('zeta');
    expect(rows[2][1]).toBe('—');
  });

  it('--architect <name> shows only that architect\'s builders', async () => {
    await status({ architect: 'alpha' });

    const rows = builderDataRows();
    expect(rows.map((r) => r[0])).toEqual(['builder-a']);
  });

  it('--mine resolves the current architect from CODEV_ARCHITECT_NAME', async () => {
    const prev = process.env.CODEV_ARCHITECT_NAME;
    process.env.CODEV_ARCHITECT_NAME = 'zeta';
    try {
      await status({ mine: true });
    } finally {
      if (prev === undefined) delete process.env.CODEV_ARCHITECT_NAME;
      else process.env.CODEV_ARCHITECT_NAME = prev;
    }

    const rows = builderDataRows();
    expect(rows.map((r) => r[0])).toEqual(['builder-b']);
  });

  it('reports an empty filtered result without a table', async () => {
    await status({ architect: 'nobody' });

    expect(builderDataRows()).toHaveLength(0);
    const infoLines = mockLoggerInfo.mock.calls.map((c) => stripAnsi(String(c[0])));
    expect(infoLines.some((l) => l.includes('none owned by') && l.includes('nobody'))).toBe(true);
  });
});

// ============================================================================
// JSON output (Spec 1057)
// ============================================================================

describe('afx status --json (Spec 1057)', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockIsRunning.mockResolvedValue(false);
    mockLoadState.mockReturnValue({
      architect: null,
      architects: [{ name: 'main', cmd: 'claude', startedAt: '2026-06-16T10:00:00Z' }],
      builders: [
        builder('builder-b', 'zeta'),
        builder('builder-a', 'alpha', { terminalId: undefined }), // not running
      ],
      utils: [],
      annotations: [],
    });
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
  });

  function parsePayload() {
    expect(logSpy).toHaveBeenCalledTimes(1);
    return JSON.parse(String(logSpy.mock.calls[0][0]));
  }

  it('emits a single JSON document carrying spawnedByArchitect and running', async () => {
    await status({ json: true });

    const payload = parsePayload();
    expect(payload.tower.running).toBe(false);
    expect(payload.ownerFilter).toBeNull();
    expect(payload.builders).toHaveLength(2);

    const byId = Object.fromEntries(payload.builders.map((b: any) => [b.id, b]));
    expect(byId['builder-a'].spawnedByArchitect).toBe('alpha');
    expect(byId['builder-a'].running).toBe(false);
    expect(byId['builder-b'].spawnedByArchitect).toBe('zeta');
    expect(byId['builder-b'].running).toBe(true);
    // Sorted by owner: alpha before zeta.
    expect(payload.builders.map((b: any) => b.id)).toEqual(['builder-a', 'builder-b']);
  });

  it('honors the --architect filter in JSON', async () => {
    await status({ json: true, architect: 'zeta' });

    const payload = parsePayload();
    expect(payload.ownerFilter).toBe('zeta');
    expect(payload.builders.map((b: any) => b.id)).toEqual(['builder-b']);
  });

  it('does not emit human chrome (header) in JSON mode', async () => {
    const { logger } = await import('../utils/logger.js');
    await status({ json: true });
    expect((logger.header as any)).not.toHaveBeenCalled();
  });
});
