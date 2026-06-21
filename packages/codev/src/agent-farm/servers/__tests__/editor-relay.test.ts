/**
 * Tests for the Tower editor + command relay.
 *
 * Scope: the editor relay (wants-context demand gating, context fan-out), the
 * command relay (canonical verbs), and the presence-expiry timer that releases
 * editor-context demand when the controller goes away. The module reads NO
 * project files.
 */

import { describe, it, expect, beforeEach, afterEach, vi, type Mock } from 'vitest';
import { Readable } from 'node:stream';
import type * as http from 'node:http';
import {
  initEditorRelay,
  shutdownEditorRelay,
  markPresence,
  handleWantsContext,
  handleEditorContext,
  handleCommand,
  type EditorRelayDeps,
} from '../editor-relay.js';

function fakeReq(body: unknown): http.IncomingMessage {
  return Readable.from([Buffer.from(JSON.stringify(body))]) as unknown as http.IncomingMessage;
}

function fakeRes(): { statusCode: number; body: string; res: http.ServerResponse } {
  const captured = { statusCode: 0, body: '', res: null as unknown as http.ServerResponse };
  captured.res = {
    writeHead(code: number) {
      captured.statusCode = code;
    },
    end(b?: string) {
      captured.body = b ?? '';
    },
  } as unknown as http.ServerResponse;
  return captured;
}

describe('editor + command relay', () => {
  let broadcast: Mock<EditorRelayDeps['broadcast']>;

  beforeEach(() => {
    broadcast = vi.fn<EditorRelayDeps['broadcast']>();
    initEditorRelay({ broadcast });
  });

  afterEach(() => {
    shutdownEditorRelay();
    vi.restoreAllMocks();
  });

  it('signals the provider only on the 0->1 and 1->0 demand transitions', async () => {
    await handleWantsContext(fakeReq({ wanted: true }), fakeRes().res);
    await handleWantsContext(fakeReq({ wanted: true }), fakeRes().res); // second controller: no re-signal
    const wantsCalls = broadcast.mock.calls.filter((c) => c[0] === 'editor-wants-context');
    expect(wantsCalls).toEqual([['editor-wants-context', { wanted: true }]]);

    await handleWantsContext(fakeReq({ wanted: false }), fakeRes().res); // one left: still wanted
    await handleWantsContext(fakeReq({ wanted: false }), fakeRes().res); // none left: stop
    const finalWants = broadcast.mock.calls.filter((c) => c[0] === 'editor-wants-context');
    expect(finalWants).toEqual([
      ['editor-wants-context', { wanted: true }],
      ['editor-wants-context', { wanted: false }],
    ]);
  });

  it('ignores a wants:false while demand is already zero (no spurious stop)', async () => {
    await handleWantsContext(fakeReq({ wanted: false }), fakeRes().res);
    await handleWantsContext(fakeReq({ wanted: false }), fakeRes().res);
    const wantsCalls = broadcast.mock.calls.filter((c) => c[0] === 'editor-wants-context');
    expect(wantsCalls).toEqual([]);
  });

  it('fans every editor-context report out as-is (provider already throttles)', async () => {
    await handleEditorContext(fakeReq({ value: { diffFocused: true, hasSelection: false, artifactFocused: false } }), fakeRes().res);
    await handleEditorContext(fakeReq({ value: { diffFocused: true, hasSelection: true, artifactFocused: false } }), fakeRes().res);
    await handleEditorContext(fakeReq({ value: null }), fakeRes().res);

    const ctxCalls = broadcast.mock.calls.filter((c) => c[0] === 'editor-context');
    expect(ctxCalls).toHaveLength(3);
    expect(ctxCalls[0][1]).toMatchObject({ diffFocused: true, hasSelection: false });
    expect(ctxCalls[2][1]).toBeNull();
  });

  it('broadcasts a canonical verb and rejects a verb-less command', async () => {
    const ok = fakeRes();
    await handleCommand(fakeReq({ verb: 'view-diff', args: ['0809'] }), ok.res);
    expect(JSON.parse(ok.body)).toEqual({ ok: true });
    expect(broadcast).toHaveBeenLastCalledWith('command', { verb: 'view-diff', args: ['0809'] });

    const bad = fakeRes();
    await handleCommand(fakeReq({}), bad.res);
    expect(bad.statusCode).toBe(400);
  });
});

describe('presence expiry', () => {
  let broadcast: Mock<EditorRelayDeps['broadcast']>;

  beforeEach(() => {
    broadcast = vi.fn<EditorRelayDeps['broadcast']>();
    initEditorRelay({ broadcast });
  });

  afterEach(() => {
    shutdownEditorRelay();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('releases editor-context demand when controller presence goes stale', async () => {
    // A controller wants context (real timers so the stream body parses cleanly).
    await handleWantsContext(fakeReq({ wanted: true }), fakeRes().res);

    // Presence starts the expiry timer; advancing past the TTL with no refresh
    // makes it release the demand (broadcasting wants:false) and stop.
    vi.useFakeTimers();
    markPresence();
    vi.advanceTimersByTime(60_000);

    const wants = broadcast.mock.calls.filter((c) => c[0] === 'editor-wants-context');
    expect(wants).toEqual([
      ['editor-wants-context', { wanted: true }],
      ['editor-wants-context', { wanted: false }],
    ]);
  });
});
