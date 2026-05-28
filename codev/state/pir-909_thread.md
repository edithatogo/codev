# PIR #909 — area/* labels as first-class organizing concept

## 2026-05-28 — plan phase

Drafted `codev/plans/909-architect-treat-area-labels-as.md`. Key design calls made (these are the items the plan-approval gate is for):

- **Placement**: subsection under `## Quick Start`, directly after `### Project Tracking`. Topical adjacency > another top-level heading.
- **Vocabulary rendering**: mini-table (label / one-line scope), 10 rows. Bulleted list and paragraph-per-area rejected.
- **Codev / skeleton split**: codev file has the concrete 10-label table inline; skeleton files contain zero codev area names (framework-neutral discipline). Skeleton teaches the pattern via `<prefix>/<value>` placeholders.
- **Live list inline + pointer**: codev file has both (inline table for zero-memory ops, `gh label list --search area/` as the source of truth). Skeleton has only the pointer.
- **gh recipes**: group / edit / audit / bulk-move, one-liner each, ~10 lines total. Same shape in codev and skeleton, different vocabulary level.
- **`codev-skeleton/roles/architect.md`**: new `## Working with project labels` section after `## Project Tracking`.

Live label inventory captured from `gh label list --search area/` (10 labels). No mention of `area/agent-farm` — `area/tower` covers afx/agent-farm work (confirmed already in personal memory and consistent with the issue body).

Awaiting `plan-approval`.

## 2026-05-28 — plan revision after reviewer feedback

User raised two questions worth recording the answers to:

**Q1: What exactly propagates to other repos at install/update time?**
Verified at `packages/codev/src/lib/scaffold.ts:159-194` and `commands/{init,adopt,update}.ts`:
- Path 1 (copied to disk): `codev-skeleton/templates/{CLAUDE,AGENTS}.md`, `codev-skeleton/skills/*`
- Path 2 (runtime resolution via tier-4): everything else under `codev-skeleton/` — `roles/`, `protocols/`, etc.
- Path 3 (never leaves this repo): `CLAUDE.md` / `AGENTS.md` at the codev repo root, `codev/roles/architect.md` (tier-2 override for codev's own sessions)

Plan revision:
- Added `codev/roles/architect.md` to the codev-specific file set (belt-and-suspenders — architect knows the policy via either CLAUDE.md auto-load OR role-file load).
- Extended the vocabulary-leak grep to `grep -rE … codev-skeleton/` (catches any leak anywhere in the skeleton tree).

**Q2: Is the 10-area list comprehensive? What about web / dashboard / mobile?**
Hard data from `gh label list` and `gh issue list --state all`:
- 10 areas, all currently active.
- "dashboard" = `area/panel` (naming gap; user-facing synonym, label-internal name).
- "web", "mobile" — no such code exists in the repo, nothing to label.
- Real undocumented gaps: release tooling, scaffold/install (both currently catch-all under `area/core`). Issue explicitly puts new-label decisions out of scope — flagged in the plan as follow-up candidates.

Plan revision:
- Added "Synonym alert" line + bolded "dashboard" in the `area/panel` scope hint.
- Added `area/tower` "no separate area/agent-farm" callout to the table.
- Added "Areas Not Currently Labeled" section listing release / scaffold as follow-up candidates, plus a "what's not missing" subsection for the user's specific terms.
