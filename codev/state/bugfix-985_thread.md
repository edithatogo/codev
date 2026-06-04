# bugfix-985 thread

## Issue
`consult -m claude` bills the metered Opus API instead of the Claude subscription because it
forwards `ANTHROPIC_API_KEY`/`ANTHROPIC_AUTH_TOKEN` into the Agent SDK env, which shadows
`CLAUDE_CODE_OAUTH_TOKEN` in the SDK's auth priority. Reported by shannon:main (~$150/day).

## Investigate (done)
Root cause confirmed in source on this branch:
- `packages/codev/src/commands/consult/index.ts`, `runClaudeConsultation()` lines 504-509
  copy ALL of `process.env` into the `env` object passed to `claudeQuery`. That includes
  `ANTHROPIC_API_KEY`/`ANTHROPIC_AUTH_TOKEN` when present, which the Agent SDK prioritizes
  over `CLAUDE_CODE_OAUTH_TOKEN`.
- No existing test exercises this env construction. Function is not exported.
- Established testability pattern in this file: internal helpers re-exported with `_` prefix
  (see export block ~line 1627). Test dir: `src/commands/consult/__tests__/` (vitest).
- Adjacent (noted, not in scope): line 519 hardcodes `model: 'claude-opus-4-6'`.

## Fix plan
- Extract env-building into a pure exported helper `buildClaudeConsultEnv(processEnv)` so it's
  unit-testable. When `CLAUDE_CODE_OAUTH_TOKEN` is set, delete `ANTHROPIC_API_KEY` and
  `ANTHROPIC_AUTH_TOKEN` from the LOCAL env object (not global process.env). When OAuth token
  is absent, preserve the API key (CI/key-only envs keep working).
- Regression test in `__tests__/claude-auth-env.test.ts`.
- Doc note in consult docs re: subscription-credit caveat (2026-06-15).

## Fix (done)
- `consult/index.ts`: extracted env-building into exported pure helper
  `buildClaudeConsultEnv(processEnv)`. Strips `ANTHROPIC_API_KEY`/`ANTHROPIC_AUTH_TOKEN`
  from the local copy only when `CLAUDE_CODE_OAUTH_TOKEN` is set; preserves the key
  otherwise. `runClaudeConsultation` now calls the helper.
- Regression test: `__tests__/claude-auth-env.test.ts` (4 cases: strip-on-oauth,
  preserve-without-oauth, no-mutation-of-source, drops-undefined). All pass.
- Doc note added to `codev/resources/commands/consult.md`.
- Verified: consult suite 79/79 pass; `tsc --noEmit` clean (after building codev-core
  in the fresh worktree). Net diff well under 300 LOC.

BUGFIX protocol phases: Investigate → Fix → Create PR.
