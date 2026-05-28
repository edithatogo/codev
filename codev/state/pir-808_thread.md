# pir-808 thread

## Plan phase — initial draft (2026-05-28)

Wrote `codev/plans/808-vscode-backlog-architect-refer.md`. Key decisions captured there:

- Thread `issueTitle` as a typed field on `BacklogTreeItem` (option B). Rejected parsing it out of the composite display label (option A) — too brittle, label format has varied historically.
- Extract a small pure `buildArchitectReferenceInjection(issueId, title)` helper so the escape + fallback logic gets direct unit coverage instead of relying on the source-sentinel regex pattern in `extension-architect-commands.test.ts`.
- Escape `"` → `\"` only; leave backslashes untouched (acceptance criteria say `"` escaping only, and double-escaping `\` would change rendered vs typed semantics).

Existing sentinel test at `extension-architect-commands.test.ts:77-85` needs updating; current literal regex `injectArchitectText(\`#\${issueId} \`)` will fail against the new injection shape.

Sitting at `plan-approval` gate after commit + push.

## Plan approved → implement (2026-05-28)

Implemented as planned. One mechanical change vs the plan: extracted `buildArchitectReferenceInjection` into its own file `packages/vscode/src/architect-reference-injection.ts` (rather than exporting it from `extension.ts`) so the unit test can import the live function — `extension.ts` imports `vscode` at top level which can't load under vitest's node env without mocking. Same precedent as `prune-builder-terminals.ts`.

Local checks:
- `pnpm check-types` ✓ (clean — note: needed `pnpm -w build` first to populate workspace package types, then `packages/types pnpm build` for esbuild to resolve `@cluesmith/codev-types`)
- `pnpm lint` ✓
- `node esbuild.js` ✓
- `pnpm test:unit` ✓ 55 tests (was 49, +6 from `architect-reference-injection.test.ts`)
- `porch done` checks: build ✓ (5.4s), tests ✓ (20.5s)

Sitting at `dev-approval` gate.
