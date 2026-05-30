# PIR #810 — vscode builder row legibility

## Plan phase

Wrote `codev/plans/810-vscode-builder-row-legibility.md`.

Two changes in `packages/vscode/src/views/builders.ts` (`makeBuilderRow`):
- **A** — phase as leading prefix `#<id> [<phase>] <title>...` (was trailing suffix, truncated off-screen).
- **B** — blocked-row codicon dispatched by gate (uniform warning-yellow), bell fallback.

### Key findings (corrections to the issue's proposed code)
1. **Icon map must key off `b.blockedGate`, not `b.blocked`.** `b.blocked` is a human-readable label (`"plan review"`) per `overview.ts:410-455`; `b.blockedGate` is the canonical name (`"plan-approval"`). The issue's snippet (`GATE_ICONS[b.blocked]`) would never match → Change B would silently no-op. Added a regression test asserting `gateIconFor('plan review') === 'bell'`.
2. **Added `verify-approval` → `verified`** to the icon map (a real gate from #927 the issue's map omitted).

### Design decision
Extracting two pure vscode-free helpers (`gateIconFor`, `builderRowLabel`) into new `builder-row.ts` (mirrors `backlog-filter.ts`) so the acceptance-criteria unit tests run under vitest `__tests__/` instead of the heavier Electron `src/test/` harness. Slightly more LOC than the issue's inline sketch, but the testing requirement makes extraction the right call.

Plan approved.

## Implement phase

Extracted two pure helpers into new `packages/vscode/src/views/builder-row.ts`:
- `gateIconFor(blockedGate)` — gate→codicon, keyed off canonical `b.blockedGate`, bell fallback. Includes `verify-approval`→`verified`.
- `builderRowLabel(b, isIdle, now)` — phase-prefix label.
- `timeSince(isoDate, now)` — moved here, now takes `now` param for deterministic tests.

`builders.ts` `makeBuilderRow` now calls both; removed its local `timeSince`.

### Deviation from plan
`builderRowLabel` takes `isIdle` as a **parameter** rather than importing `isIdleWaiting` from `@cluesmith/codev-core`. Reason: the vitest `__tests__/` harness runs against source with codev-core unbuilt, so a runtime import of `@cluesmith/codev-core/builder-helpers` (subpath → `dist/`) fails to resolve. Injecting `isIdle` (which the caller already computes for icon/contextValue dispatch) keeps the helper genuinely pure + test-runnable with no build step, and avoids a double `isIdleWaiting` call. Cleaner separation overall.

### Checks
- `pnpm check-types` ✓ (after building codev-types + codev-core, which the fresh worktree `pnpm install` had left without `dist/`)
- `pnpm lint` ✓
- `node esbuild.js` ✓
- `pnpm test:unit` ✓ 122 passed (9 new in `builder-row.test.ts`)

Awaiting `dev-approval` gate.
