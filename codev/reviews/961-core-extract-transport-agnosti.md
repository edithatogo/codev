# PIR Review: Extract transport-agnostic reconnect policy into `@cluesmith/codev-core`

Fixes #961

## Summary

The exponential-backoff reconnect curve (`min(1000·2^attempt, cap)`) was hand-rolled at four call sites across three packages, with divergent tuning (max-attempts 6 vs 50) and divergent session-unknown handling. This PR extracts a pure `ReconnectPolicy` module into `@cluesmith/codev-core` — `backoffDelayMs` (the shared curve), `BackoffController` (counter + status + give-up), and `classifyUpgradeError` (the session-unknown rule) — and adopts it at all four sites. Three adoptions are behavior-preserving refactors (VSCode terminal, SSE health-check, tunnel); the web terminal is the one place with deliberate behavior changes (give-up unified 50→6, plus a real recovery affordance), both resolved at the plan gate.

## Files Changed

- `packages/core/src/reconnect-policy.ts` (+219 / -0) — new pure module
- `packages/core/src/__tests__/reconnect-policy.test.ts` (+148 / -0) — new, 17 unit tests
- `packages/core/package.json` (+7 / -1) — `./reconnect-policy` export, `vitest` devDep, `test` script
- `packages/core/vitest.config.ts` (+8 / -0) — new (core had no test runner)
- `packages/core/tsconfig.json` (+2 / -1) — exclude tests from the build (codev's convention)
- `packages/vscode/src/terminal-adapter.ts` (+13 / -23) — adopt `BackoffController` + `classifyUpgradeError`
- `packages/vscode/src/connection-manager.ts` (+5 / -1) — SSE adopts `backoffDelayMs`
- `packages/dashboard/src/components/Terminal.tsx` (+27 / -19) — adopt controller; 50→6; recovery affordance
- `packages/dashboard/__tests__/Terminal.reconnect.test.tsx` (+38 / -6) — updated for the 6-attempt contract + recovery test
- `packages/codev/src/agent-farm/lib/tunnel-client.ts` (+13 / -3) — `calculateBackoff` reimplemented over the shared curve
- `.github/workflows/test.yml` (+4 / -0) — run core unit tests in CI
- `codev/resources/arch.md` (+2 / -2) — `ReconnectPolicy` added as a shared core primitive
- `codev/resources/lessons-learned.md` (+2 / -0) — two durable lessons
- `codev/plans/961-*.md`, `codev/state/pir-961_thread.md` — plan + builder thread

## Commits

- `89a8a7e9` [PIR #961] Add transport-agnostic ReconnectPolicy to codev-core
- `f9fb2961` [PIR #961] Adopt ReconnectPolicy in vscode terminal + SSE clients
- `3118a52d` [PIR #961] Adopt ReconnectPolicy in web terminal; unify give-up at 6
- `febd1e56` [PIR #961] Reimplement tunnel calculateBackoff over shared curve
- `8ac242a0` [PIR #961] Run core unit tests in CI; update thread
- `07414aeb` [PIR #961] Align core tsconfig exclude with codev's convention
- `1e49da4a` [PIR #961] Drop dormant web-terminal classifier seam (defer to #971)
- (plus thread-update commits)

## Test Results

- `pnpm build` (root: core + codev incl. dashboard): ✓ pass
- `pnpm test` (codev suite): ✓ 3210 passed, 13 skipped
- `packages/core`: ✓ 17 new tests
- `packages/vscode` `test:unit`: ✓ 222 (the `terminal-adapter` close-loop drives the **real** `BackoffController` and still asserts `[1s,2s,4s,8s,16s,30s]` → give-up)
- `packages/dashboard` reconnect suite: ✓ 12 (incl. a new recovery-affordance test)
- Manual verification (human, `dev-approval` gate): ran the worktree; exercised VSCode + dashboard terminals against a forced give-up.

## Architecture Updates

Updated `codev/resources/arch.md`: added `ReconnectPolicy` alongside `EscapeBuffer` in the two places that enumerate `@cluesmith/codev-core`'s shared primitives (the subsystem guide and the package table). This PR follows — rather than introduces — the existing "pure cross-host logic lives in core" pattern (`EscapeBuffer` is the cited precedent), so no new module-boundary documentation was needed beyond naming the new primitive.

## Lessons Learned Updates

Added two entries to `codev/resources/lessons-learned.md` (Architecture section):
1. A browser `WebSocket` can't see a failed upgrade's HTTP status (only `CloseEvent 1006`), so the Node-`ws` session-unknown fast-path can't be ported to the dashboard without a server-side close-code change — and a classifier wired against `CloseEvent.code` must not assume HTTP-4xx semantics.
2. When unifying a primitive across call sites with different counter-increment orderings, keep the core computation a pure function of an explicit `attempt` arg and layer stateful give-up logic on top only where needed — a single shared stateful counter would silently re-tune the differently-ordered sites.

## Things to Look At During PR Review

- **`BackoffController` give-up sequencing** (`reconnect-policy.ts`): the off-by-one is deliberate — `nextDelayMs()` uses `attempt - 1` so the first retry is the base delay, and `recordFailure()` returns `give-up` only once the budget is exhausted. The contract is pinned by `reconnect-policy.test.ts` ("reproduces the terminal-adapter give-up sequence") and by the *real-controller* vscode close-loop test.
- **Tunnel parity** (`tunnel-client.ts`): `calculateBackoff` keeps its exact signature/behavior (jitter, 60s cap, 5-min floor after 10). The guard is the unchanged `tunnel-client.test.ts` — confirm it still passes (it does).
- **Web 50→6 is coupled to the recovery affordance** (`Terminal.tsx`): dropping the attempt budget makes give-up actually reachable, so the refresh button was enriched to do a true reconnect from the dead-socket state (it previously SIGWINCH'd a live socket only). If you review one without the other, the change looks like a regression.
- **No dormant code**: the dashboard classifier seam was intentionally **not** shipped (it was inert + had a provisional numeric contract). Web stays on blind retry; the real session-unknown adoption is deferred to **#971** (needs a browser-visible Tower close code).
- **CI scope**: this PR adds a core test step but vscode/dashboard unit suites still aren't in CI — pre-existing gap tracked in **#967**.

## How to Test Locally

- **View diff**: VSCode sidebar → right-click builder `pir-961` → **View Diff**
- **Run dev server**: VSCode sidebar → **Run Dev Server**, or `afx dev pir-961`
- **What to verify** (the acceptance cross-package smoke test):
  - Open a VSCode terminal **and** the web dashboard terminal against the worktree.
  - Kill Tower mid-session; confirm **both** surface their give-up state with consistent ~6-attempt / ~61s timing.
  - VSCode: the #939 reconnect link still appears and reconnects.
  - Web: the refresh button now performs a true reconnect after give-up (not just a refit).
  - Restart Tower; confirm a fresh connect resets the counter on both surfaces.

## Flaky Tests

None skipped. One **pre-existing, deterministic** failure is unrelated to this change and left untouched per protocol: `packages/dashboard/__tests__/scrollController.test.ts > ScrollController > onScroll handler > warns on unexpected scroll-to-top` — it fails on a clean tree too (verified by stashing this PR's only dashboard change; the test imports `ScrollController`, never `Terminal`). It must be fixed or quarantined before the dashboard unit suite can gate CI — captured in #967.
