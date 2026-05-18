# Phase 3 Review Rebuttals — Iteration 1

**Phase**: implement / phase_3 (Affinity-aware routing)
**Iteration**: 1
**Date**: 2026-05-18

## Reviewer verdicts

| Reviewer | Verdict | Confidence |
|----------|---------|------------|
| Codex    | REQUEST_CHANGES | HIGH |
| Gemini   | REQUEST_CHANGES | HIGH |
| Claude   | REQUEST_CHANGES (process) | HIGH |

All actionable points addressed in the same commit. Claude's "uncommitted" finding was a process artifact of the SPIR cadence (consult runs before commit) — the commit lands now.

---

## Codex — REQUEST_CHANGES

### C1. `architect:<name>` parsing is broken end-to-end

> `parseAddress()` splits `architect:sibling` into `project='architect', agent='sibling'` and the resolver tries to find a workspace named 'architect'. The Phase 3 tests masked this by calling `resolveTarget('sibling', WS, ...)` directly, which is not how the real CLI/API path behaves. Required spec case ("rejects address-spoofing") was therefore not actually being exercised.

**Status**: Addressed. Real bug — and a deserved hit. The tests bypassing parseAddress had hidden the real bug.

**Change**: Added a new resolver branch in `resolveTarget` that fires *before* `findWorkspaceByBasename`:

```ts
if (project && project.toLowerCase() === 'architect') {
  if (!fallbackWorkspace) { return NO_CONTEXT; }
  return resolveArchitectByName(agent, fallbackWorkspace, sender);
}
```

`resolveArchitectByName` looks up the architect by name in the current workspace's `architects` map, applies the Spec 755 spoofing check (builder sender + name mismatch → reject), and returns the terminal ID. Removed the now-redundant inline `entry.architects.has(agent)` block from `resolveAgentInWorkspace` since the per-name route lives in the proper place.

Five new end-to-end tests in `spec-755-phase3-routing.test.ts` exercise the real path with `resolveTarget('architect:sibling', WS, sender)`:
- Allowed when the name matches the sender's spawning architect.
- Rejected (verbatim) when the name mismatches.
- Allowed for non-builder senders (cron, workspace-root).
- NOT_FOUND for unknown architect names.
- NO_CONTEXT when no workspace context is supplied.

The three older "plain name routing" tests (which exercised the interim, incorrect, in-workspace-by-name path) were removed.

---

## Gemini — REQUEST_CHANGES

### G1. `lookupBuilderSpawningArchitect` uses singleton `getDb()` — wrong DB under Tower

> Tower serves multiple workspaces; the singleton DB is tied to the daemon process's startup CWD. The plan explicitly instructed using `new Database(path.join(workspacePath, '.agent-farm', 'state.db'), { readonly: true })` per the `servers/overview.ts` pattern.

**Status**: Addressed. Critical correctness fix — under Tower, the wrong DB would have been queried for every routing decision.

**Verification**: Re-read both the plan and `servers/overview.ts:704-723`. The plan was explicit about this pattern; I missed it.

**Change**: `lookupBuilderSpawningArchitect(builderId, workspacePath?)` now opens a per-workspace readonly handle when `workspacePath` is supplied; falls back to the singleton when omitted (CLI callers that don't have workspacePath plumbed). The Tower-side caller (`resolveAgentInWorkspace`) passes `workspacePath` so the right DB is queried regardless of which workspace the request is for. Mirrors the `overview.ts` pattern exactly. Added `path` / `existsSync` / `Database` imports to `state.ts`.

### G2. Error messages deviate from spec verbatim text

> Spec says lowercase "legacy builder" without quotes around `<id>` and no trailing period; implementation has "Legacy builder '${builderId}' ... ."

**Status**: Addressed. Tightened to match spec verbatim.

**Change**: All three error-message functions in `tower-messages.ts` updated:
- Lowercase first word ("legacy" / "builder").
- Dropped quotes around interpolated IDs.
- Dropped trailing periods.

Tests already import the exported functions, so the assertion updates automatically without test changes (the constant-import single-source-of-truth pattern worked as designed).

---

## Claude — REQUEST_CHANGES (process)

### Cl1. Phase 3 code is uncommitted

> The builder marked build_complete in status.yaml but left the implementation as uncommitted working-tree changes.

**Status**: Process artifact — not a real issue.

**Verification**: The SPIR cadence is `implement → porch check → 3-way consult → incorporate feedback → commit`. `porch check` flips `build_complete=true` after build + tests pass; commit happens last so it captures both the original implementation and any consult-driven fixes in one atomic commit. Claude saw the in-between state.

**Change**: Committing now, with all Codex/Gemini fixes folded in.

### Cl2 (minor). Legacy builder + `architect:<name>` addressing

> Legacy builders (null `spawnedByArchitect`) targeting `architect:main` get rejected by the spoofing check (`null !== 'main'`). Conservative and safe — they should use the generic `architect` target.

**Status**: Acknowledged. The spec doesn't require legacy builders to be able to use `architect:<name>` (they're an edge case to begin with). Conservative-reject is correct.

### Cl3 (minor). No latency microbenchmark

> The plan called for a microbenchmark. The functional test (asserts `lookupBuilderSpawningArchitect` is NOT called on the fast path) is a better proxy than flaky timing.

**Status**: Acknowledged. Functional verification of the fast path is in place and asserts the SQL-skipping invariant. No change.

---

## Items I did NOT change

- **Legacy builders restricted from `architect:<name>`**: conservative-reject is correct (Cl2).
- **No microbenchmark**: functional test of fast-path skipping is sufficient (Cl3).
- **CLI side `from` field**: `commands/send.ts` already populates `from` from the worktree path. No changes needed there — Phase 3 just plumbs it through into the resolver.

---

## Summary

Three real bugs caught and fixed:
1. **`architect:<name>` end-to-end parsing** (Codex) — the spoofing rejection wasn't actually wired through the CLI path; now it is, with five new end-to-end tests covering the matrix.
2. **Per-workspace DB lookup** (Gemini) — Tower would have queried the wrong state.db for every cross-workspace routing decision; fixed by passing workspacePath into `lookupBuilderSpawningArchitect`.
3. **Verbatim error text** (Gemini) — three error messages tightened to match the spec text exactly.

`porch check 755` passes (build + tests). All 2667 codev tests pass, including 18 new Spec 755 Phase 3 routing tests. Phase 3 ready to commit.
