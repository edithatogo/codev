import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockKillScopedShellpers = vi.fn();

vi.mock('../../terminal/session-manager.js', () => ({
  SessionManager: vi.fn(function SessionManagerMock() {
    return { killScopedShellpers: mockKillScopedShellpers };
  }),
}));

vi.mock('../utils/config.js', () => ({
  getConfig: vi.fn(() => ({ serversDir: '/tmp/codev-test-servers' })),
}));

vi.mock('../utils/logger.js', () => ({
  logger: {
    header: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    success: vi.fn(),
    kv: vi.fn(),
    blank: vi.fn(),
  },
  fatal: vi.fn((message: string) => {
    throw new Error(message);
  }),
}));

vi.mock('../lib/tower-client.js', () => ({
  DEFAULT_TOWER_PORT: 4100,
  AGENT_FARM_DIR: '/tmp/codev-test-agent-farm',
}));

vi.mock('node:child_process', async () => {
  const actual = await vi.importActual<typeof import('node:child_process')>('node:child_process');
  return {
    ...actual,
    spawn: vi.fn(),
    execSync: vi.fn(() => {
      throw new Error('no process on port');
    }),
  };
});

describe('tower command lifecycle options', () => {
  beforeEach(() => {
    mockKillScopedShellpers.mockReset();
  });

  it('waits for tower start readiness by default', async () => {
    const { shouldWaitForTowerStart } = await import('../commands/tower.js');

    expect(shouldWaitForTowerStart()).toBe(true);
    expect(shouldWaitForTowerStart({ wait: undefined })).toBe(true);
    expect(shouldWaitForTowerStart({ wait: false })).toBe(false);
  });

  it('cleans scoped shellpers on explicit stop by default when tower is already stopped', async () => {
    mockKillScopedShellpers.mockResolvedValue(2);
    const { towerStop } = await import('../commands/tower.js');

    await towerStop({ port: 49_123 });

    expect(mockKillScopedShellpers).toHaveBeenCalledTimes(1);
  });

  it('preserves scoped shellpers when requested', async () => {
    mockKillScopedShellpers.mockResolvedValue(2);
    const { towerStop } = await import('../commands/tower.js');

    await towerStop({ port: 49_123, preserveShellpers: true });

    expect(mockKillScopedShellpers).not.toHaveBeenCalled();
  });
});
