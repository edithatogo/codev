# PIR #971 — web terminal session-unknown fast-path

## Plan phase (in progress)

Issue: web terminal can't fast-path a "session gone" reconnect because browsers
can't read a failed-upgrade HTTP 404 (they only see close 1006). VSCode/Node
already fast-paths via `classifyUpgradeError("Unexpected server response: 404")`.

Investigation findings:
- `classifyUpgradeError` (core, `reconnect-policy.ts:201`) already has a dormant
  object/`code` form (built #961). Object form only matches HTTP range 400–499.
- Tower rejects unknown sessions at upgrade stage at TWO sites:
  `tower-websocket.ts:163-167` (direct `/ws/terminal/:id`) and `:235-239`
  (workspace route). Two OTHER 404s (`:196`, `:248`) are routing errors, not
  session-unknown — left alone.
- VSCode adapter (`terminal-adapter.ts:185`) uses the STRING form via `error`
  event; its `close` handler ignores codes. So to avoid regressing it, Tower must
  keep the HTTP 404 for Node clients.
- Discriminator chosen: presence of `Origin` header. Browsers always send it on
  WS upgrade; the Node `ws` client sends none. Same pattern as CORS check at
  `tower-routes.ts:195`.
- Test harness exists: `tower-websocket.test.ts` mocks `wss.handleUpgrade` and
  emits `server.emit('upgrade', {url, headers}, socket, head)` — easy to assert
  both the 404-write (Node) and the close(4404) (browser) branches.

Design decisions:
- Shared constant `WS_CLOSE_SESSION_UNKNOWN = 4404` exported from core.
- Keep the 400–499 HTTP-range check in the object form (disjoint from WS code
  ranges, so harmless; preserves existing tests).
- Dashboard `onclose(event)` → `classifyUpgradeError({ code: event.code })`;
  permanent → immediate give-up + notice, refresh button remains recovery path.

Plan written to `codev/plans/971-web-terminal-adopt-session-unk.md`. Awaiting
plan-approval gate.

## Plan approved → rebased on main (18 commits), no target files changed, anchors verified.

## Implement phase (done, awaiting dev-approval)

Implemented exactly to plan:
- core `reconnect-policy.ts`: `WS_CLOSE_SESSION_UNKNOWN = 4404` export; added
  `code === 4404 → permanent` branch ahead of the kept 400-499 HTTP-range check;
  updated doc comment for the overloaded code meaning.
- Tower `tower-websocket.ts`: `rejectUnknownSession()` helper (Origin present →
  accept upgrade + `ws.close(4404, 'session-unknown')`; else HTTP 404). Wired both
  session-not-found sites (direct + workspace). Other routing-error 404s untouched.
- Dashboard `Terminal.tsx`: `onclose(event)` consults
  `classifyUpgradeError({ code: event.code })`; permanent → disconnected + notice,
  no retry. Transient 1006 still blind-retries.

Tests: core +2 cases (19 pass). Tower +2 browser-path cases, clarified 2 Node-path
cases (27 pass in file). Full codev suite: 3224 pass / 13 skip / 0 fail.

Note: a first full-suite run showed transient `session-manager.test.ts` failures
("Invalid shellper info JSON" — real-shellper subprocess spawn race under parallel
load). Verified independent: session-manager imports none of my files, passes in
isolation (67/67), and the re-run full suite is fully green. Pre-existing flakiness,
not caused by this change.

Builds: core ✓, codev ✓, dashboard ✓ (tsc + vite).
