# bugfix-922 thread

## Investigate
Reproduced the YAML parse error with the snippet in the issue. Root cause is
exactly as described: unquoted `description:` scalar containing
`two operating modes: diff-mode` — the bare `: ` makes the parser try to
nest a mapping inside the scalar.

## Fix
One-line change: wrapped the entire `description:` value in double quotes.
No embedded double quotes in the string, so no escaping needed. Verified
with the issue's repro snippet (now exits 0, parses successfully, prints
the description starting with "Audit, prune, and update...").

Scope adhered to: only `codev-skeleton/.claude/skills/update-arch-docs/SKILL.md`
modified. The three live working copies (`.claude/`, `.codex/`, `.gemini/`)
are intentionally left untouched per issue scope.

## Flaky tests
`pnpm test` fails locally on 3 pre-existing flaky tests in
`packages/codev/src/terminal/__tests__/session-manager.test.ts`, tracked in
#905. Not fixed here — out of scope.

Note on intermediate history: I initially skipped these to unblock porch's
phase-advance check (per the role file's "Handling Flaky Tests" section),
but the architect corrected me — #905 documents that the same skip was
already attempted and reverted from PR #904 as out-of-scope. The skip
commit was reverted (`fe08391c`); diff vs main for the test file is empty.

## PR
Pushing to `mohidmakhdoomi/codev` fork per builder preference; PR
fork → upstream (`cluesmith/codev`).
