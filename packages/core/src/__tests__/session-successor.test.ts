/**
 * Unit tests for successor-session resolution (#991).
 */
import { describe, it, expect } from 'vitest';
import { resolveSuccessorTerminalId, type SessionRef } from '../session-successor.js';

// Minimal builder/architect shapes — the helper only reads id/name/terminalId.
function builder(id: string, terminalId?: string) {
  return { id, terminalId } as never;
}
function architect(name: string, terminalId?: string) {
  return { name, terminalId } as never;
}
function state(opts: { builders?: unknown[]; architects?: unknown[] }) {
  return { builders: opts.builders ?? [], architects: opts.architects ?? [] } as never;
}

describe('resolveSuccessorTerminalId — builder', () => {
  it('resolves the current terminalId by exact id', () => {
    const s = state({ builders: [builder('builder-spir-153', 't-new')] });
    expect(resolveSuccessorTerminalId(s, { kind: 'builder', id: 'builder-spir-153' })).toBe('t-new');
  });

  it('tail-matches a bare numeric id against the canonical builder id', () => {
    const s = state({ builders: [builder('builder-spir-153', 't-new')] });
    expect(resolveSuccessorTerminalId(s, { kind: 'builder', id: '153' })).toBe('t-new');
  });

  it('returns the NEW id after a restart (same stable id, mutated terminalId)', () => {
    // Pre-restart the tab held 't-old'; fresh state carries the successor.
    const s = state({ builders: [builder('builder-pir-991', 't-successor')] });
    expect(resolveSuccessorTerminalId(s, { kind: 'builder', id: 'builder-pir-991' })).toBe('t-successor');
  });

  it('returns null when the builder is gone from state', () => {
    const s = state({ builders: [builder('builder-spir-1', 't1')] });
    expect(resolveSuccessorTerminalId(s, { kind: 'builder', id: '999' })).toBeNull();
  });

  it('returns null when the builder is present but has no terminalId', () => {
    const s = state({ builders: [builder('builder-spir-7')] });
    expect(resolveSuccessorTerminalId(s, { kind: 'builder', id: 'builder-spir-7' })).toBeNull();
  });

  it('returns null (not a throw) on an empty/absent builders list', () => {
    expect(resolveSuccessorTerminalId(state({}), { kind: 'builder', id: '1' })).toBeNull();
  });
});

describe('resolveSuccessorTerminalId — architect', () => {
  it('resolves the current terminalId by stable name', () => {
    const s = state({ architects: [architect('main', 'a-new'), architect('ob-refine', 'b-new')] });
    expect(resolveSuccessorTerminalId(s, { kind: 'architect', name: 'main' })).toBe('a-new');
    expect(resolveSuccessorTerminalId(s, { kind: 'architect', name: 'ob-refine' })).toBe('b-new');
  });

  it('returns the NEW id after a restart for the same architect name', () => {
    const s = state({ architects: [architect('main', 'a-successor')] });
    expect(resolveSuccessorTerminalId(s, { kind: 'architect', name: 'main' })).toBe('a-successor');
  });

  it('returns null when the named architect is absent', () => {
    const s = state({ architects: [architect('main', 'a1')] });
    expect(resolveSuccessorTerminalId(s, { kind: 'architect', name: 'sibling' })).toBeNull();
  });

  it('returns null when the architect has no terminalId', () => {
    const s = state({ architects: [architect('main')] });
    expect(resolveSuccessorTerminalId(s, { kind: 'architect', name: 'main' })).toBeNull();
  });

  it('returns null (not a throw) on an empty/absent architects list', () => {
    const ref: SessionRef = { kind: 'architect', name: 'main' };
    expect(resolveSuccessorTerminalId(state({}), ref)).toBeNull();
  });
});
