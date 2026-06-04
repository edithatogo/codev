# Specification: Make Durable Engineering Wisdom Consumed at Decision Time (Retire `lessons-learned.md`, Route by Type)

## Metadata
- **ID**: spec-2026-06-04-987-engineering-wisdom-write-only
- **Issue**: #987
- **Status**: draft
- **Created**: 2026-06-04
- **Protocol**: SPIR (strict)

## Clarifying Questions Asked

The issue framed this as a genuine design fork and asked the spec phase to resolve it. Three forks were surfaced to the architect; answers are recorded here and are binding constraints for the rest of this spec.

1. **What is the fate of the existing `lessons-learned.md` (~250 entries, mostly spec-narrow recipes)?**
   → **Retire entirely, route everything.** Delete the file. Every lesson worth keeping migrates to a *consumed* surface (CLAUDE.md / role files, a protocol step, a porch check, or a design-time prompt). The reviews remain the historical record; git history retains the deleted file.

2. **How should design-time wisdom reach the builder at spec/plan time (the "dash of A")?**
   → **Bounded always-injected digest.** A small, curated design-heuristics surface (~1 screen) is injected into the design (specify/plan) phase context every time. No relevance-retrieval engine, no tagging/matching system — the boundedness of the set is what makes "always inject" viable.

3. **Should consumption be enforced by a machine check, or be an executed protocol step?**
   → **Executed step, no hard check.** Consumption is achieved by putting the digest into always-on design context (an executed protocol step), not by adding a brittle prose-presence porch check. (Brittle prose checks on LLM output are themselves a documented anti-pattern.)

## Problem Statement

`codev/resources/lessons-learned.md` is **write-only**. Durable engineering wisdom accretes into it, but nothing in the framework *consumes* it at the moment a decision is being made, so it cannot change agent behavior under load.

Every framework reference to the file is producer-side or prune-side:
- The SPIR / ASPIR / PIR **review** phase (and `porch/prompts/review.md`) **append** entries to it.
- The **MAINTAIN** protocol + `update-arch-docs` skill **extract into / prune** it.
- The only porch **check** enforces that the *review file* contains a `## Lessons Learned Updates` section — it does **not** enforce that anyone *reads* the lessons.

**Nothing reads or injects it at design/spec time, and nothing enforces that it is read.** It is append-only accretion with no consumer: documentation that hopes to be grepped, which under load agents do not do. The concrete downstream failure cited in the issue — a boolean-vs-role auth design miss — is exactly the class of mistake a *written-but-unread* lesson can never prevent, because the file is not in context when the design is chosen.

The governing principle (from the issue): **wisdom only changes behavior if it lives in always-on context (role / CLAUDE.md), an executed protocol step, or an enforced check.** A markdown archive nobody reads is none of those.

## Current State

**The file.** `codev/resources/lessons-learned.md` is ~400 lines / ~250 entries across topical sections (Critical, Security, Architecture, Process, Testing, UI/UX, Documentation, 3-Way Reviews, Protocol Orchestration, Debugging). Entries are one-liners tagged only by source (`[From NNNN]`). There is **no** area/type metadata. A large majority of entries are **spec-narrow implementation recipes** ("vitest 4 constructor mocks require class syntax", "HTML-escape user content", "use `path.sep` in path checks") — precisely the content the `update-arch-docs` skill's own rules say should be pruned to the originating review, but which has accreted anyway. A genuinely durable, cross-cutting, *design-time* subset is buried inside this noise.

**Producers (write/prune) — verified:**
- `codev-skeleton/protocols/{spir,aspir}/prompts/review.md` (§4 "Update Architecture and Lessons Learned Documentation") and `codev-skeleton/protocols/pir/prompts/review.md`: instruct the builder to read the file and **append** generalizable lessons, then record what was added in the review's `## Lessons Learned Updates` section.
- `codev-skeleton/porch/prompts/review.md`: same pattern.
- `codev-skeleton/protocols/maintain/{protocol.md,prompts/maintain.md}`: scan `codev/reviews/`, extract lessons, **add** them to the file; audit/prune via the skill.
- `update-arch-docs` skill (`.claude/skills/...` and `codev-skeleton/.claude/skills/...`): owns the pruning discipline and the arch.md-vs-lessons-learned two-doc routing.

**Enforcement — verified:** `codev-skeleton/protocols/{spir,aspir,pir}/protocol.json` define a review-phase check `review_has_lessons_updates` = `grep -q '## Lessons Learned Updates' codev/reviews/${PROJECT_TITLE}.md`. This polices the **producer** (the review file mentions lessons), never the **consumer**.

**Consumers (read at decision time) — verified: NONE.**
- `packages/codev/src/commands/porch/prompts.ts` (`buildPhasePrompt()`) injects project summary, plan-phase content, user answers, and prior-iteration history into phase prompts. It **never reads `lessons-learned.md`.**
- The `specify.md` / `plan.md` phase prompts never read it.
- Role files (`roles/builder.md`, `roles/architect.md`) never reference it.
- `CLAUDE.md` / `AGENTS.md` mention it only as a MAINTAIN *target* and a directory-map entry — there is no "consult before designing" instruction.

**Scale & shape of the change (verified):** the file/term is referenced across **both** the `codev/` instance tree **and** the `codev-skeleton/` distribution tree (mirrored protocol copies for spir/aspir/pir/maintain, the skill in two places, `CLAUDE.md`, `AGENTS.md`, `templates.ts`), plus many **historical** artifacts that must NOT be edited (`codev/maintain/*.md` run logs, `codev/plans/*`, `codev/projects/*`, `projectlist-archive.md`, `cmap-value-analysis-*.md`, prior-project rebuttals). `templates.ts` lists `resources/lessons-learned.md` as a protected `USER_DATA` path (preserved across `codev update`). This is a protocol-removal-scale edit (~dozens of files across two mirrored trees), with the well-known dual-directory footgun.

## Desired State

`lessons-learned.md` is **gone**, and the durable wisdom it held now lives only where it is actually consumed:

1. **A new bounded design-heuristics surface** (e.g. `codev/resources/design-heuristics.md`, mirrored into `codev-skeleton/templates/`) holds the small set of cross-cutting, *design-time* heuristics that would change a spec/plan decision. It is **capped** (fits in roughly one screen) and is **literally injected into the specify and plan phase prompts every time**, so it is unavoidably in context when the design is chosen — not a "please go read this file" pointer that load-shedding agents skip.

2. **Behavioral rules** ("always/never X") that are general enough live as **CLAUDE.md / AGENTS.md invariants or role-file rules** — always-on context.

3. **Process/protocol lessons** are folded into the relevant **protocol prompt/step** itself.

4. **Spec-narrow recipes and implementation tips** are **not migrated anywhere** — they already live in the originating review document, which is the searchable historical record. They are deliberately dropped from any always-on/consumed surface.

5. **Producers route, not append.** At review time, a builder who captures a durable lesson **routes it by type** to the correct consumed surface (rule → CLAUDE/role; heuristic → the bounded digest, observing its cap; process → protocol step), or records that none qualified. There is no longer a "dump it into the archive" path, so the accretion failure mode cannot recur.

6. **MAINTAIN polices the bound, not the archive.** MAINTAIN / `update-arch-docs` no longer generates a lessons archive. Its lessons-side responsibility becomes keeping the bounded digest *bounded* (audit for bloat / displacement) and confirming routed rules landed in the right surface. Its arch.md responsibility is unchanged.

The net effect: the framework stops maintaining an unread archive that *looks* like a safety net, and instead guarantees that the small amount of wisdom that actually changes design decisions is in front of the builder at the moment it matters.

## Stakeholders
- **Primary Users**: Builder agents at spec/plan time (consume the digest); review-phase agents (route, don't append).
- **Secondary Users**: Architects (curate the digest and the routed rules); MAINTAIN runs (police the bound).
- **Technical Team**: Codev framework maintainers (this repo + downstream adopters who inherit the skeleton).
- **Business Owners**: M Waleed Kadous (architect / decision authority).

## Success Criteria
- [ ] `codev/resources/lessons-learned.md` and `codev-skeleton/templates/lessons-learned.md` are **deleted**.
- [ ] A bounded `design-heuristics.md` exists in both the `codev/` instance and the `codev-skeleton/` distribution, with an explicit stated cap (entry count and/or "fits one screen") and a documented displacement discipline.
- [ ] The digest is **seeded** by a one-time migration: the durable design-time subset of the old archive is distilled into the digest; general behavioral rules are migrated to CLAUDE/AGENTS/role files; everything else is intentionally dropped (preserved by git history + reviews).
- [ ] The **specify** and **plan** phase prompts inject the digest content such that it is present in the assembled phase prompt **verbatim and unconditionally** (not as a pointer to read a file). Verifiable by assembling a phase prompt and confirming the heuristics text appears.
- [ ] The **review** prompts (spir/aspir/pir + `porch/prompts/review.md`) are changed from "append to `lessons-learned.md`" to "**route the lesson to its consumed surface**," with a renamed review section (e.g. `## Wisdom Routing`) replacing `## Lessons Learned Updates`.
- [ ] The porch `review_has_lessons_updates` check (spir/aspir/pir `protocol.json`) is updated to match the renamed review section (no new *consumption* check is added).
- [ ] **MAINTAIN** protocol + `maintain.md` prompt + the `update-arch-docs` skill (both tree copies) no longer generate/prune a lessons archive; they instead audit the bounded digest and the routed surfaces. The skill's frontmatter `description` and registration text are updated accordingly.
- [ ] `templates.ts` `USER_DATA` list no longer protects the deleted file and protects `resources/design-heuristics.md` instead.
- [ ] `CLAUDE.md` and `AGENTS.md` are updated (directory map, MAINTAIN bullet) and remain byte-identical to each other; they describe the new consumption model.
- [ ] A full-repo `rg` for `lessons-learned` / `lessons_learned` / `Lessons Learned` returns **zero hits in live framework files** (protocols, prompts, skills, CLAUDE/AGENTS, templates, roles, source). Hits remaining only in **historical** artifacts (`codev/maintain/*`, `codev/plans/*`, `codev/projects/*`, archives, prior reviews) are acceptable and must be left untouched.
- [ ] Changes are applied in **both** the `codev/` and `codev-skeleton/` mirrored trees wherever a file exists in both.
- [ ] All existing tests pass; any test asserting the old review section / old file path is updated.

## Constraints

### Architect's binding decisions (from clarifying questions — treat as baked)
- **Retire entirely, route everything** — delete `lessons-learned.md`; no "keep the archive alongside" option.
- **Bounded always-injected digest** as the design-time mechanism — no tagging/area-matching system, no retrieval/embedding engine.
- **Executed step, no hard consumption check** — consumption via always-on design context, not a porch prose-presence gate.

### Technical constraints
- Dual mirrored trees (`codev/` instance + `codev-skeleton/` distribution) must be kept consistent; every edit must be audited in both locations.
- Historical artifacts (maintain run logs, prior plans/projects/reviews, archives, the release protocol's historical references, `cmap-value-analysis`) are **read-only history** — do not rewrite them to erase the term.
- `arch.md` and `lessons-learned.md` are sibling governance docs; any `arch.md` cross-pointer to the retired file must be updated, but `arch.md`'s own content is otherwise out of scope.
- Downstream adopters inherit the skeleton; the skeleton change must leave a *coherent* new model (a seeded/example design-heuristics template and a routing-based review prompt), not a dangling reference.

### Process constraints
- No time estimates (per protocol).
- Follow the dual-directory audit discipline; run exhaustive `rg` before claiming "all references updated."

## Assumptions
- The bounded digest's value comes from being *small and always-present*; the cap is the mechanism that prevents re-accretion, so the cap must be explicit and the producer-side routing must honor it (add-by-displacement, not add-by-append).
- The durable design-time subset distilled from ~250 entries is small (order ~10–25 heuristics); most of the archive is correctly dropped.
- Reviews + git history are an adequate home for the dropped spec-narrow recipes; nothing of *consumed* value is lost by deleting them, because they were never consumed.
- Injecting at the **design** phases (specify, plan) is the right scope; implement-phase injection is out of scope (the cited failures are design-time misses).

## Solution Approaches

The issue named two directions. Both are weighed; the chosen direction is the architect-decided hybrid.

### Approach A: Inject the whole archive at design time
**Description**: Read `lessons-learned.md` and inject it (or a relevance-filtered slice) into the design prompt.
**Pros**: Reuses the existing file; consumption is direct.
**Cons**: Dumping the whole file re-creates the unbounded-accretion problem inside every design prompt (250 entries of mostly-irrelevant recipes drown the few that matter). A relevance filter (tagging by `area/*`, keyword/embedding match) is real machinery to build and maintain, and the architect explicitly rejected building a retrieval system. **Rejected** as the primary mechanism.
**Estimated Complexity**: High (if filtered) / Low-but-ineffective (if unfiltered)
**Risk Level**: High

### Approach B: Retire + route by type into consumed surfaces
**Description**: Delete the archive. Route each lesson by type to the surface that consumes it: behavioral rule → CLAUDE/role; design-time heuristic → a bounded digest injected at design time; process lesson → protocol step; spec-narrow recipe → left in its review (dropped from any consumed surface).
**Pros**: Directly implements the governing principle. Eliminates the write-only failure mode at the *producer* (no append path). The bound on the digest is a structural guarantee against re-accretion. No retrieval engine.
**Cons**: One-time migration/curation cost. Deleting a 250-entry file is a large, cross-tree edit. Loses the *illusion* of a tips archive (mitigated: the tips live in reviews + git).
**Estimated Complexity**: Medium
**Risk Level**: Medium

### Chosen: Approach B with a bounded slice of A (architect-decided)
Retire the archive (B), and for the genuinely design-sensitive subset use a **bounded** form of design-time injection (the disciplined slice of A): a small curated digest, literally injected at specify/plan time. The relevance-retrieval problem that sinks naive-A **dissolves** because the injected set is bounded small enough to always show in full. The "dash of A" is therefore not a retrieval system — it is a one-screen digest that is always on.

**Key design elements:**
- **Routing taxonomy** (used both for the one-time retirement migration and ongoing at review time):

  | Lesson type | Consumed surface | Why consumed |
  |---|---|---|
  | General behavioral rule ("always/never X") | CLAUDE.md / AGENTS.md invariant or role file | always-on context |
  | Design-time heuristic that changes a spec/plan decision | bounded `design-heuristics.md`, injected at specify/plan | executed step in always-on design context |
  | Process / protocol improvement | the protocol prompt/step itself | executed step |
  | Spec-narrow recipe / impl tip | stays in originating review only (not routed) | reviews are the searchable record |

- **Bounded digest** with an explicit cap and an **add-by-displacement** rule: a new heuristic must earn its slot or displace a weaker one. The cap, not a checker, is what holds the line.
- **Literal injection** (not a pointer): the digest text is concatenated into the specify/plan prompt (e.g. a `{{design_heuristics}}` template variable filled from the single source file, so there is one source of truth and no drift). Whether via template variable in `buildPhasePrompt()` or an equivalent assembly point is a plan-level (HOW) decision; the spec requires only that the text appear verbatim and unconditionally in the assembled design prompt.
- **Producer becomes a router**: review prompts route by the taxonomy; the review section is renamed (`## Wisdom Routing`) and the existing porch check follows the rename. This is a producer-side section check that already exists — it is not a new consumption gate, so it honors the "no hard consumption check" decision.
- **MAINTAIN repurposed**: police the bound + the routed surfaces instead of growing an archive.

## Open Questions

### Critical (Blocks Progress)
- None. The three forks are resolved by the architect's answers.

### Important (Affects Design)
- [ ] **Exact cap and home of the digest.** Proposed: `codev/resources/design-heuristics.md`, capped at "fits one screen" (~20–25 single-line heuristics). Final number to be set in the plan / confirmed at the plan gate.
- [ ] **Injection mechanism location.** Template variable filled by `buildPhasePrompt()` (one source of truth, small TS change) vs. inlining the digest into the prompt templates (no TS change but drift risk). Lean: template variable. Resolve in plan.
- [ ] **Review-section rename vs. removal.** Keep a renamed `## Wisdom Routing` section (preserves a producer-side check and a paper trail of routing decisions) vs. drop the section entirely. Lean: rename + keep, since it is not a consumption check and provides routing evidence.

### Nice-to-Know (Optimization)
- [ ] Whether the implement-phase prompt should also surface the digest (currently out of scope — design-time only).
- [ ] Whether a short "how to curate the digest" note belongs in the architect role file.

## Test Scenarios

This is a methodology/mechanism change; "tests" are largely structural assertions plus prompt-assembly verification.

### Functional Tests
1. **Injection present**: assemble a `specify` (and `plan`) phase prompt for a sample project and assert the design-heuristics text appears verbatim in the assembled prompt.
2. **Single source of truth**: editing the digest source file changes the assembled prompt (no second copy to keep in sync).
3. **Producer routes**: the spir/aspir/pir review prompts contain the routing taxonomy and the renamed section; no instruction to append to a lessons archive remains.
4. **Check follows rename**: the porch `protocol.json` review check greps for the renamed section and passes on a correctly-routed review.
5. **Deletion + zero live references**: the archive files are absent; `rg` for the term returns zero hits in live framework files (protocols/prompts/skills/CLAUDE/AGENTS/templates/roles/source), hits only in historical artifacts.

### Non-Functional Tests
1. **Bound respected**: the seeded digest fits the stated cap.
2. **Cross-tree consistency**: every changed file present in both `codev/` and `codev-skeleton/` is changed in both; new digest exists in both.
3. **Suite green**: existing unit/e2e tests pass; tests referencing the old section/path are updated.

## Dependencies
- **Internal**: porch prompt assembly (`buildPhasePrompt`), the spir/aspir/pir/maintain protocol definitions + prompts (both trees), the `update-arch-docs` skill (both trees), `templates.ts`, `CLAUDE.md`/`AGENTS.md`, role files.
- **External**: none.
- **Libraries/Frameworks**: none new.

## Risks and Mitigation
| Risk | Probability | Impact | Mitigation |
|------|------------|--------|-------------|
| Missed references in the dual tree (footgun) | High | Med | Exhaustive `rg` across both trees before commit; explicit both-tree audit step; CMAP reviewers historically catch this. |
| Editing historical artifacts to "clean up" the term | Med | Med | Explicit out-of-scope list (maintain runs, plans, projects, archives, release protocol history); leave history intact. |
| Digest silently re-accretes over time | Med | Med | Explicit cap + add-by-displacement rule + MAINTAIN bound-audit; producer prompt forbids "append, will trim later". |
| Losing a genuinely useful recipe by deleting the archive | Low | Low | Recipes remain in their reviews + git history; only the *unread* always-on copy is removed. If one is truly load-bearing it becomes a rule/heuristic during migration. |
| "Inject" interpreted as a weak "please read" pointer (the very failure being fixed) | Med | High | Success criterion requires the text to appear *verbatim and unconditionally* in the assembled prompt, not a file reference. |
| Downstream adopters left with a dangling skeleton | Low | Med | Skeleton ships a seeded/example digest + routing-based review prompt, leaving a coherent model. |

## Expert Consultation
<!-- Populated after the multi-agent consultation checkpoint. -->
**Date**: TBD
**Models Consulted**: Gemini, Codex, Claude (SPIR default)
**Sections Updated**: TBD

## Approval
- [ ] Architect Review (human gate: spec-approval)
- [ ] Expert AI Consultation Complete

## Notes
This spec deliberately keeps WHAT/WHY here and defers file-by-file mechanics (exact cap number, template-variable vs inline injection, the precise migration of each surviving heuristic) to the plan. The one-time **migration/curation** of the durable subset is itself a meaningful piece of work and should be its own plan phase, kept separate from the mechanical deletion + reference sweep.

---

## Amendments

<!-- TICK amendments, if any, recorded here in chronological order. -->
