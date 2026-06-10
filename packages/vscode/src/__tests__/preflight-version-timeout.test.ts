/**
 * Unit tests for the #1024 probe-timeout logic: the pure `resolveVersionTimeout`
 * defaulting/clamping and the `runCodevVersion` probe honouring its `timeoutMs`.
 *
 * Both live in `preflight-core.ts` (vscode-free), so this runs under vitest with
 * no vscode mock. `runCodevVersion` spawns a real process; we drive it with tiny
 * temp scripts (a fast one that prints a version, a slow one that hangs) so the
 * timeout path is exercised deterministically without depending on `codev`.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, writeFileSync, chmodSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  DEFAULT_VERSION_TIMEOUT_MS,
  MIN_VERSION_TIMEOUT_MS,
  MAX_VERSION_TIMEOUT_MS,
  resolveVersionTimeout,
  runCodevVersion,
} from '../preflight/preflight-core.js';

describe('resolveVersionTimeout', () => {
  it('falls back to the default when the setting is unset', () => {
    // Negative case (#1024 acceptance): setting unset → default, not 400.
    expect(resolveVersionTimeout(undefined)).toBe(DEFAULT_VERSION_TIMEOUT_MS);
    expect(resolveVersionTimeout(null)).toBe(DEFAULT_VERSION_TIMEOUT_MS);
    expect(DEFAULT_VERSION_TIMEOUT_MS).toBe(5000);
  });

  it('falls back to the default for non-numeric / non-finite values', () => {
    expect(resolveVersionTimeout(Number.NaN)).toBe(DEFAULT_VERSION_TIMEOUT_MS);
    expect(resolveVersionTimeout(Infinity)).toBe(DEFAULT_VERSION_TIMEOUT_MS);
  });

  it('passes a valid in-range value through unchanged', () => {
    expect(resolveVersionTimeout(12000)).toBe(12000);
  });

  it('clamps an out-of-range value to [MIN, MAX]', () => {
    expect(resolveVersionTimeout(10)).toBe(MIN_VERSION_TIMEOUT_MS);
    expect(resolveVersionTimeout(999999)).toBe(MAX_VERSION_TIMEOUT_MS);
  });
});

describe('runCodevVersion', () => {
  let dir: string;
  let fastBin: string;
  let slowBin: string;

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'codev-preflight-'));
    // Ignores its args (so the hardcoded `--version` is irrelevant) and prints
    // a version immediately.
    fastBin = join(dir, 'fast.sh');
    writeFileSync(fastBin, '#!/bin/sh\necho 3.1.9\n');
    chmodSync(fastBin, 0o755);
    // Hangs well past any test timeout so the probe's own timer is what settles it.
    slowBin = join(dir, 'slow.sh');
    writeFileSync(slowBin, '#!/bin/sh\nsleep 30\n');
    chmodSync(slowBin, 0o755);
  });

  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('resolves ok with stdout when the probe completes within budget', async () => {
    const result = await runCodevVersion(fastBin, null, 5000);
    expect(result.ok).toBe(true);
    expect(result.timedOut).toBe(false);
    expect(result.stdout).toContain('3.1.9');
  });

  it('honours an explicit timeoutMs: kills a hung probe and reports timedOut', async () => {
    // Positive case (#1024 acceptance): a binary that never returns is killed at
    // the supplied budget, not left to hang. A generous budget would let `sleep
    // 30` outlast the test, so the small explicit value is what makes this pass.
    const start = Date.now();
    const result = await runCodevVersion(slowBin, null, 150);
    const elapsed = Date.now() - start;
    expect(result.ok).toBe(false);
    expect(result.timedOut).toBe(true);
    expect(elapsed).toBeLessThan(5000);
  });

  it('reports ok=false (not timedOut) when the binary cannot be spawned', async () => {
    const result = await runCodevVersion(join(dir, 'does-not-exist'), null, 1000);
    expect(result.ok).toBe(false);
    expect(result.timedOut).toBe(false);
  });
});
