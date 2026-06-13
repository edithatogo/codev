# PIR Plan: `codev init` bootstraps `codev/resources/` cold-tier files (arch.md + lessons-learned.md)

> **Rebased on main 2026-06-13.** Spec 987 (two-tier governance docs) landed since this plan was first drafted and changes the picture materially. This revision re-scopes the work to ride the 987 rails. See "What Spec 987 already did" below.

## Understanding

The issue: fresh `codev init` projects have no `codev/resources/arch.md` or `lessons-learned.md`, so review prompts that read them error out.

### What Spec 987 already did (post-rebase reality)

Spec 987 introduced a **hot/cold two-tier** governance-doc model and, as part of it, wired resource materialization into init/adopt/update — but **only for the HOT tier**:

- `copyHotTierDefaults()` (`scaffold.ts:161`) copies skeleton `templates/arch-critical.md` + `templates/lessons-critical.md` into `codev/resources/`, with `skipExisting` for adopt/update. It is called at all three sites:
  - `init.ts:117` (no skip — fresh project)
  - `adopt.ts:159` (`skipExisting: true`)
  - `update.ts:263` (`skipExisting: true`, with a `dryRun` branch + `result.newFiles` reporting)
- `update` already **backfills** missing hot files for existing adopters (`update.ts:258-268`). The "should update touch resources?" question we discussed at the gate is therefore already settled in the codebase: backfill-missing-only via `skipExisting` is the shipped house style.
- The COLD files `resources/arch.md` and `resources/lessons-learned.md` are **already registered as protected user data** (`templates.ts:83-84`), so update's clean step will never overwrite them — they're just never *created*.

### What's still broken (the residual #1012 gap)

The **COLD** files are still not materialized by any command. The review prompts reference them directly:

- `spir/prompts/review.md:156` — "Read `arch-critical.md` (hot) and **skim `arch.md`** (cold)."
- `spir/prompts/review.md:163` — skim `lessons-learned.md` (cold).
- `pir/prompts/review.md:88,99-100` — routes changes into / `git add`s `arch.md` and `lessons-learned.md`.

Beyond the prompts, the cold files are the **archive that the hot-tier maps point into**: each hot template carries a "Map of arch.md (consult when…)" section that directs readers into `arch.md`. Materializing the cold tier is the coherent completion of 987's model, not just an error-avoidance patch.

So the fix shrinks from the original "invent `createResourcesDir` with inline placeholder content" to: **add a cold-tier sibling to `copyHotTierDefaults` and wire it in at the same three sites.**

## Proposed Change

Mirror the proven 987 hot-tier path for the cold tier.

1. **`scaffold.ts`** — add, directly below `HOT_TIER_FILES` / `copyHotTierDefaults`:
   - `export const COLD_TIER_FILES = ['arch.md', 'lessons-learned.md'] as const;`
   - `export function copyColdTierDefaults(targetDir, skeletonDir, options)` — byte-for-byte structural mirror of `copyHotTierDefaults`: ensure `codev/resources/` exists, copy each cold file from `skeletonDir/templates/`, honor `skipExisting`, return `{ copied, skipped }`.

2. **Generalize the existing copy mechanism** rather than fork it. Extract the shared body of `copyHotTierDefaults` into a private `copyResourceDefaults(targetDir, skeletonDir, files, options)` (the exact logic already at `scaffold.ts:166-189`: ensure `resources/` exists, copy each file from `skeletonDir/templates/`, honor `skipExisting`, return `{ copied, skipped }`). Then:
   - `copyHotTierDefaults = (…) => copyResourceDefaults(…, HOT_TIER_FILES, …)` — behavior byte-identical to today; the load-bearing 987 path is preserved.
   - `copyColdTierDefaults = (…) => copyResourceDefaults(…, COLD_TIER_FILES, …)` where `COLD_TIER_FILES = ['arch.md', 'lessons-learned.md']`.

3. **Wire `copyColdTierDefaults` into the three commands**, immediately after each existing `copyHotTierDefaults` call (identical logging/`fileCount`/`result.newFiles` handling):
   - `init.ts:~117` — `copyColdTierDefaults(targetDir, skeletonDir)` (no skip).
   - `adopt.ts:~159` — `copyColdTierDefaults(targetDir, skeletonDir, { skipExisting: true })`.
   - `update.ts:~263` — `copyColdTierDefaults(targetDir, templatesDir, { skipExisting: true })`, inside the same `dryRun` if/else, pushing to `result.newFiles`/logging `+ (new)`. Extend the dry-run message to mention `{arch,lessons}.md` too.

### Content source: fix the skeleton templates, don't hand-roll content

This is the crux the gate discussion settled. There is **no resolver or command that serves these files at read time** — review prompts read the literal path `codev/resources/arch.md`, and the file is registered as project-owned user data (`templates.ts:83-84`) with deliberately no runtime fallback (the #1011 boundary). So the file must physically exist; init has to materialize it, exactly as it already does for the hot tier. "Just call the command" still bottoms out in a copy.

The earlier idea of writing *inline string* content in `scaffold.ts` is rejected: it forks the materialization mechanism (inline strings vs `fs.copyFileSync` from skeleton) for no reason. Instead, **fix the source of truth** so the one existing mechanism does its job:

- The only thing wrong with copying the current `templates/arch.md` verbatim is its **"Note on propagation"** section, which asserts the file is *not* copied into projects and gives a manual-`cp` recipe. Once `codev init` copies it, that note is false and self-contradicting.
- **Verified blast radius is nil**: nothing in `packages/**` (non-test) reads `templates/arch.md` or `templates/lessons-learned.md` — they are pure copy sources. So editing them is safe.
- **Change**: remove the "Note on propagation" section from `templates/arch.md` (and the parallel "Generated by MAINTAIN" footer line in `templates/lessons-learned.md` that reads falsely in a brand-new project). Keep the lean section scaffolding ("How to use this template", the stub headings, "skip if N/A" hints) — that scaffolding is exactly what makes the file a useful starter and what the hot-tier "Map of arch.md" expects to point into.

Net: content lives in the skeleton (where every other template lives), one copy mechanism serves both tiers, no inline content, no second code path.

**Remaining judgment for the gate**: how lean to trim. I propose a light trim (drop only the propagation note + the false footer; keep the structural stubs). If you'd rather go all the way to the issue's one-line `_No architecture documented yet._` placeholder, that's a heavier edit to the skeleton templates — say which you prefer.

### Skeleton mirroring

This repo is self-hosted: `codev-skeleton/templates/` is the shipped template, and the live `codev/resources/arch.md` in *this* repo is the project's own curated copy. The edit is to **`codev-skeleton/templates/{arch,lessons-learned}.md`** only (the shipped starters). Our own `codev/resources/*` cold files already exist and are untouched.

## Files to Change

- `packages/codev/src/lib/scaffold.ts` — extract `copyResourceDefaults` helper; redefine `copyHotTierDefaults` in terms of it (no behavior change); add `COLD_TIER_FILES` + `copyColdTierDefaults`.
- `codev-skeleton/templates/arch.md` — remove the "Note on propagation" section (it becomes false once copied).
- `codev-skeleton/templates/lessons-learned.md` — remove the false "Generated by MAINTAIN" footer; keep section scaffolding.
- `packages/codev/src/commands/init.ts` — import + call `copyColdTierDefaults` after `copyHotTierDefaults` (~line 117).
- `packages/codev/src/commands/adopt.ts` — same (~line 159, `skipExisting`).
- `packages/codev/src/commands/update.ts` — same, inside the hot-tier `dryRun` block (~line 263); extend dry-run log line.
- `packages/codev/src/__tests__/hot-tier-materialization.test.ts` (or a new parallel `cold-tier-materialization.test.ts`) — mirror the two unit tests (`copies both cold files` / `skip-existing preserves a curated copy`) and the update-integration test (`update creates the cold files`) for the cold tier. Keep a regression assertion that `copyHotTierDefaults` behavior is unchanged after the refactor.
- `packages/codev/src/__tests__/init.test.ts:74` — replace the stale comment ("resources/ is NOT created in minimal structure") with positive assertions that all four resource files exist after init.
- `packages/codev/src/__tests__/adopt.test.ts` — assert cold files appear after adopt.

Estimated net diff: ~30 LOC source + skeleton template trims + ~70 LOC tests.

## Risks & Alternatives Considered

- **Refactor risk: generalizing `copyHotTierDefaults` could regress the load-bearing 987 hot path** (porch injection + managed-block depend on it). Mitigated: `copyHotTierDefaults` keeps its exact signature and is reimplemented as a one-line delegate to `copyResourceDefaults`; a regression test asserts unchanged behavior; full suite run confirms.
- **Editing the skeleton cold templates** (`arch.md`/`lessons-learned.md`). Verified safe: grep shows no non-test code reads those template files; they are pure copy sources. The trim only removes self-referential text that becomes false once the files are copied.
- **Content-source deviation from the issue** (skeleton starter vs one-line inline placeholder). The issue's "minimal inline" wording predates Spec 987's copy-from-skeleton pattern; this plan keeps the *mechanism* the issue implied (a real starter file exists) while sourcing it the 987 way. Recorded in the review as a deliberate, gate-approved deviation; the lean-vs-ultra-minimal trim is the one open sub-decision.
- **Risk: stale negative assertions break.** `init.test.ts:74` is only a comment (no assertion), so no breakage; I update it to a positive assertion. Full suite run will confirm nothing else asserts absence.
- **`copyResourceTemplates` remains dead code** (987's own comment flags it as such). Out of scope here; flagged for the architect to retire separately if desired.
- **Alternative: do nothing in `update`** (init/adopt only). Rejected — update is the only command that reaches pre-987/pre-fix projects, and 987 already backfills the hot tier there; leaving the cold tier out would be asymmetric and re-open the gap for existing projects.
- **Alternative: inline string content in `scaffold.ts`.** Rejected — forks the materialization mechanism for no benefit (see "Content source" above).

## Test Plan

- **Unit**: `copyColdTierDefaults` copies both cold files (creating `resources/`); `skipExisting` preserves a curated `arch.md` while creating the missing sibling.
- **Unit (init)**: `init --yes` yields all four `codev/resources/*.md` files.
- **Unit (adopt)**: `adopt --yes` on a plain repo yields the cold files.
- **Integration (update)**: update on a project missing the cold files creates both and reports them in `result.newFiles`; a customized `arch.md` survives byte-identical while `lessons-learned.md` is created; `--dry-run` writes nothing. (Mirror the existing hot-tier update integration test.)
- **Build + full suite**: `pnpm --filter @cluesmith/codev build && pnpm --filter @cluesmith/codev test` from the worktree.
- **Manual (dev-approval reviewer)**:
  1. Build, then run the built CLI `init` into a temp dir; confirm output lists `+ codev/resources/arch.md` and `+ codev/resources/lessons-learned.md` alongside the hot files.
  2. `cat` both cold files — present and readable (the original failure mode is gone).
  3. In a codev project missing the cold files (pre-fix simulation), run `codev update`; confirm both are backfilled and a pre-existing customized `arch.md` is untouched.
