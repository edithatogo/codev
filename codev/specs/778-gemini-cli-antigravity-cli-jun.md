# Specification: Survive the Gemini CLI Retirement (June 18, 2026)

## Metadata
- **ID**: spec-2026-06-01-778-gemini-cli-retirement
- **Status**: draft
- **Created**: 2026-06-01
- **Issue**: #778
- **Deadline**: 2026-06-18 (17 days from spec authoring)

## Clarifying Questions Asked

No spec pre-existed and the issue contains no "Baked Decisions" section, so the builder did not
block on clarifying questions (per SPIR strict-mode flow, the architect decides at the
spec-approval gate). The builder instead resolved the open questions through research and a
codebase audit, and surfaces the one genuinely architectural fork below for the architect to
settle at the gate.

Questions the builder answered through research (sources in **References**):

1. **What precisely is retired on June 18, 2026, and for whom?**
   The *subscription / OAuth serving path* through the **Gemini CLI** and **Gemini Code Assist
   IDE extensions** stops serving requests for **Google AI Pro**, **Google AI Ultra**, and **free
   "Gemini Code Assist for individuals"** users. Gemini Code Assist for GitHub is also affected
   (no new org installs on June 18; existing requests stop in the following weeks). **Enterprise**
   customers (Standard / Enterprise licenses, Google Cloud access) are *unaffected*.

2. **Is the Gemini API itself retired?**
   **No.** The Gemini **Developer API** (via `GEMINI_API_KEY`, Google AI Studio) and **Vertex AI**
   remain fully operational; the API is explicitly *not* deprecated. Separately, from **June 19,
   2026** Google blocks *unrestricted* API keys — keys must be scoped to the **Generative Language
   API** in Cloud Console or they stop working with Gemini. This is a configuration note for
   API-key users, not a deprecation.

3. **Is "Antigravity CLI" a drop-in replacement for our usage?**
   **Not currently.** Antigravity CLI (binary reportedly `agy`, written in Go) is an *agent-first,
   asynchronous, multi-agent* terminal product — it orchestrates background agents for large tasks.
   That is a different shape from Codev's need (a single-shot prompt → single completion + token
   stats). Its non-interactive / JSON / model-flag contract is **unconfirmed**, and as of late May
   2026 `agy` was **not published to any public package manager**. The official migration guide page
   carried no extractable technical detail at spec time.

## Problem Statement

Codev's multi-agent consultation system (`consult`) treats **Gemini** as one of three default
reviewer "lanes" (alongside Codex and Claude). The Gemini lane works by shelling out to the
Google **Gemini CLI** binary (`gemini`). For the large class of Codev users authenticated through
the free / Pro / Ultra **subscription path**, that binary stops serving requests on **June 18,
2026**.

When that happens, every Codev workflow that runs a 3-way review — SPIR/ASPIR/MAINTAIN spec, plan,
and PR consultations; BUGFIX/AIR/PIR PR consultations; ad-hoc `consult -m gemini` — will have its
Gemini lane **fail at runtime** for affected users. Because `gemini` is in the *default* model list
for these protocols, this is not an opt-in feature that quietly no-ops; it is a default code path
that breaks. The failure is also *silent-until-invoked*: nothing surfaces today, then on June 18 a
core review path starts erroring for a major user segment with a hard calendar deadline.

This spec defines WHAT Codev must do to keep its "Gemini perspective" working past June 18, 2026,
and to stop steering users toward a serving path that is going away — WITHOUT depending on a
product (Antigravity CLI) that does not yet expose the contract Codev requires.

## Current State

Codev depends on the `gemini` CLI binary at these surfaces (audited 2026-06-01):

**Consultation dispatch (the load-bearing dependency)**
- `packages/codev/src/commands/consult/index.ts:37-40` — `MODEL_CONFIGS.gemini = { cli: 'gemini',
  args: ['--model', 'gemini-3.1-pro-preview'], envVar: 'GEMINI_SYSTEM_MD' }`.
- The Gemini lane spawns the `gemini` subprocess with `--output-format json`, passes the reviewer
  **role** via the `GEMINI_SYSTEM_MD` env var (a temp file path), delivers the **prompt over stdin**
  (to avoid `E2BIG` / V8 heap exhaustion on large PR diffs — bugfix #680), bumps `NODE_OPTIONS`
  heap, and parses a JSON result with token/usage stats.
- `packages/codev/src/commands/consult/index.ts:54-58` — alias `pro → gemini`.

**Defaults & schema (why the breakage is a default, not opt-in)**
- `packages/codev/src/lib/config.ts:88` — default consult models = `['gemini', 'codex', 'claude']`.
- `codev-skeleton/protocols/{spir,aspir,maintain}/protocol.json` — phases default to
  `["gemini", "codex", "claude"]`; `{air,pir,bugfix}/protocol.json` default to `["gemini", "codex"]`.
- `codev-skeleton/protocol-schema.json:155` — consultation model enum includes `"gemini"`.
- `packages/codev/src/commands/porch/next.ts:51` — `VALID_MODELS` includes `'gemini'`.

**Health checks & cost**
- `packages/codev/src/commands/doctor.ts:153-163` — `gemini` presence check (`required: false`),
  install hint pointing at `github.com/google-gemini/gemini-cli`.
- `packages/codev/src/commands/doctor.ts:266-274` — auth verification runs `gemini --yolo 'Reply
  with just OK'`; auth hint: "Run: gemini (interactive) then /auth, or set GOOGLE_API_KEY".
- `packages/codev/src/commands/consult/usage-extractor.ts:19` — pricing entry keyed
  `gemini-3.1-pro`.

**Docs & tests**
- References in `CLAUDE.md`, `AGENTS.md`, `README.md`, `codev-skeleton/resources/commands/consult.md`,
  the consult skill, and `DEPENDENCIES.md`.
- ~60 test cases across `consult.test.ts`, `consult.e2e.test.ts`, `metrics.test.ts`,
  `consultation-models.test.ts`, `doctor.test.ts`, `config.test.ts`.

**Net assessment**: there is exactly **one** behavioral dispatch point (the `gemini` subprocess
spawn). Everything else is configuration, health-checking, naming, docs, and tests that orbit it.
The migration is therefore narrow in *behavior* but wide in *surface*.

## Desired State

After June 18, 2026:
- A Codev user running any 3-way consultation still gets a **working Gemini perspective**, OR a
  **clear, graceful degradation** if they have not configured a working Gemini credential — never a
  silent or cryptic runtime failure mid-review.
- Codev's Gemini access **does not depend on the retiring subscription serving path** of the
  Gemini CLI. The "Gemini lane" reaches Gemini through a surface that Google has stated will keep
  working (the Gemini Developer API / Vertex AI), or degrades cleanly.
- `codev doctor` accurately reflects how the Gemini lane now authenticates and stops pointing users
  at a soon-dead setup flow; it tells affected users exactly what to do (e.g., set an API key) and
  flags the June 19 key-restriction wrinkle where relevant.
- Docs (`CLAUDE.md`, `AGENTS.md`, `README.md`, skeleton consult docs, consult skill) describe the
  current, supported Gemini setup.
- No regression to the **Codex** and **Claude** lanes, and no behavioral change for users on the
  unaffected enterprise serving path.

## Stakeholders
- **Primary Users**: Codev users on Google AI Pro / Ultra / free Gemini Code Assist who currently
  use `consult`'s Gemini lane via the subscription-authenticated `gemini` CLI.
- **Secondary Users**: All Codev users running SPIR/ASPIR/BUGFIX/AIR/PIR/MAINTAIN consultations
  (Gemini is a default reviewer in those protocols).
- **Technical Team**: Codev maintainers (consult, doctor, porch, skeleton, docs).
- **Business Owners**: @waleedkadous, @amrmelsayed (issue stakeholders).

## Success Criteria
- [ ] Running a 3-way consultation (e.g. SPIR PR review) after June 18 either returns a real Gemini
      review or degrades gracefully with a clear, actionable message — verified end-to-end, not just
      by unit test (per the "headline path" lesson: actually run `consult -m gemini`).
- [ ] The Gemini lane no longer requires the retiring subscription/OAuth serving path of the Gemini
      CLI; it works for a user who has only a Gemini **API key** configured.
- [ ] When no working Gemini credential is present, consultations do not hard-fail the whole run —
      the remaining lanes (Codex, Claude) still complete and the user is told why Gemini was skipped.
- [ ] `codev doctor` reports the Gemini lane's real status and gives correct, current setup guidance
      (including the June 19 unrestricted-key caveat where applicable).
- [ ] Token/usage accounting and cost reporting still work for the Gemini lane (no `NaN`/missing
      cost rows).
- [ ] Docs and the consult skill reference only supported setup; no dangling instructions to a dead
      path.
- [ ] All existing consult/doctor/config/porch tests pass; new tests cover the chosen Gemini path
      and the no-credential degradation. Coverage does not regress.
- [ ] No behavioral regression for the Codex and Claude lanes.

## Constraints

### Technical Constraints
- **Hard deadline**: behavior must be correct by **2026-06-18**. Solutions that depend on an
  external artifact that does not yet exist publicly (e.g. an `agy` package on npm/brew with a
  documented headless contract) carry unacceptable schedule risk.
- The consult Gemini lane needs only a **single-shot** contract: given a system/role instruction
  and a prompt (potentially a very large PR diff, >500 KB), return one completion plus token usage.
  It does **not** need agentic, async, or multi-turn behavior.
- Must preserve the existing consult interface and the role-injection + large-prompt handling that
  already exist (`GEMINI_SYSTEM_MD` role file, stdin/temp-file prompt delivery, heap handling).
- Must preserve token/usage extraction so cost reporting keeps working
  (`usage-extractor.ts` pricing + parsing).
- The four-tier file resolver means skeleton protocol JSONs and `codev/` copies must stay
  consistent; any model-name or default change touches both `codev-skeleton/` and any `codev/` copy.

### Business Constraints
- The free subscription quota that made the Gemini CLI attractive goes away for affected tiers; any
  solution that requires a paid API key is acceptable but must **degrade gracefully** for users who
  have not set one up, rather than breaking their whole workflow.
- Keep the 3-way review's *diversity value* (a genuinely independent Gemini perspective) wherever
  feasible — silently dropping Gemini permanently is a last resort, not the goal.

## Assumptions
- The Gemini **Developer API** (`GEMINI_API_KEY` / Google AI Studio) and **Vertex AI** remain
  available past June 18, 2026 (Google's stated position as of spec time).
- An official, headless-capable, package-managed Antigravity CLI with a documented
  non-interactive + JSON + model-selection contract is **not** reliably available before the
  deadline. (If this assumption proves false before implementation, Approach B becomes viable —
  see Open Questions.)
- Codev maintainers and most affected users can obtain a Gemini API key (free-tier keys exist via
  AI Studio).
- The model identity used today (`gemini-3.1-pro-preview`) maps to an available API model id; the
  exact model id to call via the API is a Plan-phase detail.

## Solution Approaches

### Approach A: Pivot the Gemini lane to the Gemini Developer API (RECOMMENDED)
**Description**: Replace the `gemini` *CLI subprocess* in the Gemini consult lane with a direct call
to the Gemini **Developer API** (e.g. via Google's official `@google/genai` SDK, or REST), using
`GEMINI_API_KEY` (falling back to `GOOGLE_API_KEY`). Map the existing role file (`GEMINI_SYSTEM_MD`)
to the API's `systemInstruction`, send the prompt as the user turn, request the same model family,
and parse token usage from the API response into the existing usage/cost pipeline. This mirrors how
Claude and Codex lanes already use SDKs rather than CLIs (`SDK_MODELS = ['claude', 'codex']`) — the
Gemini lane simply joins them.

**Pros**:
- Targets a surface Google says is **not** being retired — robust past June 18 and beyond.
- Matches Codev's actual need exactly (single-shot prompt → completion + usage); no agentic/async
  mismatch.
- Architecturally consistent with the existing SDK-based Claude/Codex lanes.
- No dependency on an unreleased/unpackaged external CLI; fully buildable today against a stable API.
- Eliminates the brittle subprocess/heap/stdin gymnastics for this lane (the API takes large inputs
  directly).

**Cons**:
- Requires a Gemini **API key**; the free OAuth subscription quota is no longer used (a cost/UX
  change for users who relied on "free via login").
- Adds an API client dependency and re-implements role-injection + usage parsing for the API shape.
- Must handle the **June 19 unrestricted-key** caveat in docs/doctor guidance.

**Estimated Complexity**: Medium
**Risk Level**: Low

### Approach B: Adopt Antigravity CLI (`agy`) as the Gemini lane backend
**Description**: Swap `MODEL_CONFIGS.gemini.cli` from `gemini` to the Antigravity CLI binary and
translate Codev's single-shot contract onto whatever non-interactive mode `agy` exposes. Matches the
issue's literal framing ("Gemini CLI > Antigravity CLI").

**Pros**:
- Directly follows the vendor's recommended migration and the issue title.
- Could continue to leverage subscription auth if `agy` supports it for the affected tiers.

**Cons**:
- `agy` is **agent-first/async/multi-agent** — a poor fit for one-shot review; behavior and output
  shape are uncertain.
- **No confirmed** headless / `--prompt` / stdin / `--output-format json` / `--model` contract;
  building against it is guesswork today.
- **Not on a public package manager** as of late May 2026 → can't be a reliable `doctor` install
  hint or CI dependency before the deadline.
- "Not 1:1 feature parity at launch" per Google — schedule and correctness risk against a hard date.

**Estimated Complexity**: High (and partly **blocked** on external availability)
**Risk Level**: High

### Approach C: Graceful degradation — make Gemini optional, default to Codex + Claude
**Description**: Treat a missing/non-working Gemini credential as a *skip-this-lane* condition rather
than a failure: the consult run completes with the remaining lanes and reports that Gemini was
skipped and why. Optionally drop `gemini` from default model lists so out-of-the-box runs don't
attempt a dead path.

**Pros**:
- Lowest effort; guarantees nothing hard-breaks on June 18.
- Sensible safety net regardless of which primary path is chosen.

**Cons**:
- On its own, *loses the Gemini perspective* — reduces the 3-way review to 2-way for affected users.
- Doesn't actually "make Codev compatible with the new Gemini access path" — it routes around it.

**Estimated Complexity**: Low
**Risk Level**: Low

### Recommendation
**Adopt Approach A as the primary path, with Approach C as its built-in fallback.** Pivot the Gemini
lane to the Gemini Developer API (robust, deadline-safe, fits Codev's actual usage and existing
SDK-lane pattern), and when no working Gemini credential is configured, degrade gracefully (Codex +
Claude still run, Gemini reported as skipped) instead of hard-failing. Keep **Approach B
(Antigravity CLI)** explicitly out of scope for this deadline-driven change and revisit it as a
*future enhancement* once `agy` is packaged and exposes a documented headless contract — at which
point it can be added as an additional backend without disrupting the API-based lane.

This recommendation diverges from the issue's literal title ("Gemini CLI > Antigravity CLI"): the
research shows the Antigravity path is the *higher-risk* one for our use case right now, and the
robust way to honor the issue's intent ("keep working past the retirement") is the API pivot. This
divergence is flagged to the architect for the spec-approval gate.

## Open Questions

### Critical (Blocks Progress)
- [ ] **Strategy choice**: Approve Approach A (API pivot + graceful degradation), or does the
      architect specifically want Antigravity-CLI adoption (Approach B) despite the schedule/contract
      risk? *(This is the spec-approval decision.)*

### Important (Affects Design)
- [ ] Which exact API model id replaces `gemini-3.1-pro-preview` for API calls, and does the pricing
      key `gemini-3.1-pro` still match the chosen model's billing? *(Plan-phase detail; flagged here.)*
- [ ] Auth precedence and naming: standardize on `GEMINI_API_KEY` with `GOOGLE_API_KEY` fallback?
      How should Vertex AI users (ADC / project-based auth) be supported, if at all, for this round?
- [ ] Should `gemini` remain in the *default* model lists, or move to opt-in so zero-config users
      aren't nudged toward a lane that needs a key? (Interacts with the graceful-degradation UX.)

### Nice-to-Know (Optimization)
- [ ] Should Codev expose a config knob to pick the Gemini model id (future-proofing against model
      renames)?
- [ ] Is there value in keeping the legacy `gemini` CLI path working for the *unaffected enterprise*
      tier as an optional backend, or is API-only simpler to maintain?

## Performance Requirements
- Gemini-lane latency should be comparable to today's CLI path (single-shot review; no regression
  perceptible in a normal consult run).
- Must handle large prompts (PR diffs > 500 KB) without the heap/`E2BIG` failures that motivated
  bugfix #680 — the API path should accept large inputs directly.

## Security Considerations
- API key handling: read from environment (`GEMINI_API_KEY` / `GOOGLE_API_KEY`); never log or echo
  the key; never write it into committed files or status artifacts.
- Document the **June 19, 2026** unrestricted-key block: guide users to scope keys to the Generative
  Language API in Cloud Console.
- No new outbound data flows beyond what the Gemini lane already sends (prompt + role) — but the
  transport changes from local CLI to a direct HTTPS API call; ensure parity in what is transmitted.

## Test Scenarios
### Functional Tests
1. **Happy path**: Gemini lane with a valid API key returns a real review with parsed token usage and
   a correct cost row.
2. **No credential**: with no `GEMINI_API_KEY`/`GOOGLE_API_KEY`, a 3-way consult completes with
   Codex + Claude and reports Gemini skipped (graceful degradation), exit behavior non-fatal.
3. **Large prompt**: a >500 KB PR diff is consulted without heap/`E2BIG` errors.
4. **Role injection**: the reviewer role/system instruction is honored by the API path (verdict
   format matches what protocol consultations expect, e.g. APPROVE/REQUEST_CHANGES parsing).
5. **End-to-end headline path**: actually run `consult -m gemini` against the spec/plan/PR flow and
   confirm a usable result (not just mocked unit tests).

### Non-Functional Tests
1. Cost/usage extraction parity (no `NaN`, pricing key resolves).
2. `codev doctor` reports correct Gemini status under: key present, key absent, key present but
   unrestricted (June 19 caveat surfaced).
3. No regression in Codex/Claude lanes (existing consult e2e still green).

## Dependencies
- **External Services**: Gemini Developer API (Google AI Studio) and/or Vertex AI.
- **Internal Systems**: `consult` dispatch, `usage-extractor` pricing/parsing, `doctor` checks,
  skeleton protocol JSONs + `porch` consultation config, four-tier resolver consistency.
- **Libraries/Frameworks**: a Gemini API client (e.g. official `@google/genai` SDK) — exact choice
  is a Plan-phase decision.

## References
- Issue #778 (this work).
- Google Developers Blog — *An important update: Transitioning Gemini CLI to Antigravity CLI*:
  https://developers.googleblog.com/an-important-update-transitioning-gemini-cli-to-antigravity-cli/
- Antigravity migration guide (no technical detail extractable at spec time):
  https://antigravity.google/docs/gcli-migration
- The Register coverage (`agy`, Go, agentic/async, availability):
  https://www.theregister.com/ai-ml/2026/05/20/bye-bye-gemini-cli-google-nudges-devs-toward-antigravity/
- Gemini Developer API vs. Enterprise / API not deprecated:
  https://ai.google.dev/gemini-api/docs/migrate-to-cloud
- Prior related work: bugfix #680 (large-prompt heap handling), bugfix #878 (gemini lane model id).

## Risks and Mitigation
| Risk | Probability | Impact | Mitigation Strategy |
|------|------------|--------|---------------------|
| Antigravity-only path can't be built in time | High | High | Choose Approach A (API), which builds against a stable, available surface today. |
| Users lack an API key on June 18 | Med | High | Graceful degradation (Approach C) so runs don't hard-fail; clear doctor + docs guidance to set a key. |
| June 19 unrestricted-key block breaks newly-made keys | Med | Med | Document the Generative Language API restriction; surface in doctor where detectable. |
| Chosen API model id / pricing key mismatch | Med | Med | Pin model id + verify pricing key in Plan phase; add a usage-parity test. |
| Skeleton vs `codev/` config drift across the resolver | Low | Med | Update both copies; add/adjust schema + config tests. |
| Scope creep into a generic multi-provider gateway | Med | Med | Keep scope to the Gemini lane; Antigravity/other backends are explicit future work. |

## Out of Scope
- Building or shipping an Antigravity CLI (`agy`) backend (future enhancement once packaged + a
  documented headless contract exists).
- A generic multi-provider gateway / model-router abstraction.
- Changes to the Codex or Claude lanes beyond what's needed to keep the 3-way run coherent.
- Vertex AI enterprise auth flows beyond a documented, optional path (decide in Open Questions).

## Expert Consultation
**Date**: (pending)
**Models Consulted**: (porch will run 3-way: Gemini, Codex, Claude at `porch done`)
**Sections Updated**: (to be filled after consultation)

## Approval
- [ ] Architect review (spec-approval gate)
- [ ] Expert AI Consultation Complete (3-way via porch)

## Notes
The migration is *narrow in behavior* (one subprocess dispatch point) but *wide in surface*
(defaults, schema, doctor, pricing, docs, ~60 tests). The Plan phase should sequence the behavioral
change first (Gemini lane → API + graceful degradation), then the orbiting config/doctor/docs/test
updates, keeping skeleton and `codev/` copies in lockstep.
