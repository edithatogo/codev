# spir-987 — Engineering wisdom is write-only

## Project
Make `codev/resources/lessons-learned.md` actually *consumed* at decision time — or retire + route it. SPIR, strict mode.

## Phase: SPECIFY (in progress)

### Investigation findings (verified against the framework)
Mapped every framework touchpoint of `lessons-learned.md`:

**PRODUCERS (write/prune):**
- SPIR/ASPIR/PIR review prompts (`codev-skeleton/protocols/*/prompts/review.md`) — builder appends entries; review-file `## Lessons Learned Updates` section is enforced by porch `checks`.
- MAINTAIN protocol step 3 + `maintain.md` prompt — extract from reviews, prune.
- `update-arch-docs` skill — audit/diff-mode pruning discipline (already routes by purpose: arch.md vs lessons-learned.md).

**CONSUMERS (read at decision time):** *NONE.* Confirmed gap.
- `buildPhasePrompt()` (`packages/codev/src/commands/porch/prompts.ts`) never reads lessons-learned.
- specify/plan prompts never read it.
- role files (builder.md, architect.md) never reference it.
- CLAUDE.md/AGENTS.md only mention it as a MAINTAIN target, no "read before designing" line.

**Structure:** ~400 lines / ~250 entries, topical sections (Critical, Security, Architecture, Process, Testing, UI/UX, …). Entries tagged only by source `[From NNNN]`. No area/type metadata. Heavy accretion of spec-narrow recipes (XSS escaping, vitest mock quirks) that the skill's own rules say should be pruned but haven't been → the file is mostly noise, with a small durable-design-wisdom subset buried in it.

### Design fork (per issue)
- **A. Inject at design time** — needs relevance retrieval (tagging/matching) or it re-creates accretion.
- **B. Retire + route by type** into consumed surfaces (rule→CLAUDE/role/step; anti-pattern→check; design consideration→design prompt).
- Architect lean: **B with a dash of A**.

Principle: wisdom only changes behavior if it lives in **always-on context**, an **executed protocol step**, or an **enforced check**.

### Next: asking architect 3 clarifying questions (archive disposition / injection mechanism / enforcement strength) before drafting.
