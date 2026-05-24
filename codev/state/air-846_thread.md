# air-846 — Remove `codev afx` / `codev agent-farm` / `codev af` wrapped variants

## Context

Issue #846: kill the `codev`-wrapped invocation surface for agent-farm. `afx` standalone bin
stays as the only supported entrypoint. Trigger was PR #833 CMAP exposing that
`workspace-recover.ts` respawns via `spawn(process.execPath, [process.argv[1], 'spawn', ...])`
— which silently breaks when `process.argv[1]` is the `codev` entrypoint instead of `afx`.
Cheaper to remove the alternate surface than patch every spawn-child callsite.

## Plan

1. `packages/codev/src/cli.ts`
   - Drop `.command('agent-farm').aliases(['afx', 'af'])` registration.
   - Drop `args[0] === 'agent-farm'` early-dispatch in exported `run()`.
   - Replace top-level argv branch (`agent-farm` / `afx` / `af`) with a non-zero exit
     emitting "`codev <variant>` is no longer supported; use `afx <subcommand>` directly".
   - Drop the now-unused `runAgentFarm` import.

2. `packages/codev/bin/afx.js` — currently delegates via `run(['agent-farm', ...args])`,
   which depended on the removed early-dispatch. Switch to importing `runAgentFarm`
   directly from `../dist/agent-farm/cli.js`. Architect's issue note ("Keep `runAgentFarm`
   itself imported — it's still used by the standalone `afx` bin shim") is best honored
   by making the bin shim import it directly rather than re-routing through cli.ts.

3. `packages/codev/bin/af.js` — standalone `af` bin (separate from the wrapped `codev af`)
   already prints its own deprecation warning. Keep it working (issue doesn't ask to
   remove this standalone) but switch to direct `runAgentFarm` call for the same reason.

4. Tests
   - Extend `src/__tests__/cli/af.e2e.test.ts` (or sibling) with cases verifying that
     `codev afx <anything>`, `codev agent-farm <anything>`, `codev af <anything>` exit
     non-zero with the deprecation stderr.
   - Existing `runAfx` E2E tests must still pass (path through afx.js bin unchanged from
     a caller's perspective).

## Decisions

- **`af` standalone bin stays.** Issue scope is the codev-wrapped variants. The
  standalone `af` bin is already deprecated and doesn't carry the
  `process.argv[1]`-split fragility — it routes the same way as `afx` will after this
  change. Removing it would expand scope.
- **No doc sweep changes needed.** Grep found zero live references to `codev afx` /
  `codev agent-farm` / `codev af` outside historical specs/plans/reviews (which we
  don't rewrite). Issue's "Docs sweep" bullet was a "spot-check suggests there are very
  few but verify" — verified, there are none.

## Iter-2 (architect-expanded scope)

Architect overrode the `af`-stays decision: human wants `af` removed in the same PR.

Changes pushed in iter-2:
- Deleted `packages/codev/bin/af.js` (`git rm`).
- Removed `"af": "./bin/af.js"` from `packages/codev/package.json` bin map.
- Removed `af` from the cli.ts deprecation handler — `codev af` now falls through to
  commander as an unknown command, consistent with `af` itself being a missing bin.
  `codev afx` and `codev agent-farm` keep their helpful deprecation stderr because
  those are the commonly-typed entrypoints that benefit from the gentle nudge.
- Updated `install.e2e.test.ts` to assert `AF_BIN` does NOT exist (was: asserts exists).
- Updated `af.e2e.test.ts` `codev af` case to assert commander's `unknown command` error.
- Removed the unused `runAf` helper from `cli/helpers.ts` (kept `AF_BIN` export for the
  negative-existence assertion).

All checks still green: 3078 unit, 83 CLI e2e. PR will re-trigger the porch `pr` gate.
