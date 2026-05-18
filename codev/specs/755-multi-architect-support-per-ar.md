# Specification: Builder-to-Architect Message Routing (Multi-Architect Support v1)

## Metadata
- **ID**: 755-multi-architect-support-per-ar
- **Status**: draft
- **Created**: 2026-05-17
- **Protocol**: SPIR
- **GitHub Issue**: #755

## Problem Statement

Some Codev users run **multiple architect agents** in the same workspace simultaneously — a pattern we call **sibling-architect**. Each architect owns an orthogonal slice of work (different feature areas, different builder pools, different decision authority) but they share the same git repo, builder farm, and Tower instance.

Today, the architect side of Codev is a **singleton per workspace**, enforced in many places. The most visible:

- `WorkspaceTerminals.architect` is `string | undefined` — a single terminal ID (`packages/codev/src/agent-farm/servers/tower-types.ts:35`).
- The local SQLite `architect` table is constrained to one row: `id INTEGER PRIMARY KEY CHECK (id = 1)` in `state.db` (`packages/codev/src/agent-farm/db/schema.ts:18`).
- The global SQLite `terminal_sessions` table stores `role_id` as `null` for rows where `type = 'architect'` (`packages/codev/src/agent-farm/db/schema.ts:94-112`) — i.e., there is no way to recover *which* architect a session was for after restart.
- `afx send architect "..."` resolves to that single terminal (`packages/codev/src/agent-farm/servers/tower-messages.ts:191-200`).
- Tower's activation flow actively *prevents* a second architect terminal (`packages/codev/src/agent-farm/servers/tower-instances.ts:354` — `if (!entry.architect) { ... }`).

When a builder runs `afx send architect "PR ready"`, the message lands at the **one architect terminal** that Tower allows — the "main" architect, which was started first. A sibling architect agent running in the same workspace is not a Tower-registered architect terminal at all, so it never receives the message directly. The human running both architects has to manually decide "does this belong to my sibling?" and copy-paste the message over. This is error-prone under cognitive load and is currently being worked around with informal `codev/<thread>-thread.md` files.

This spec scopes a v1 fix focused on the single load-bearing pain point: **routing a builder's `afx send architect` message to the specific architect that spawned that builder**. To make routing addressable, every architect terminal needs a name. The first architect started in a workspace is named `main` by default; subsequent architects are auto-numbered `architect-2`, `architect-3`, etc. unless the user specifies a name explicitly (e.g., via `afx architect --name <name>`). `main` is just the default name of the first architect — there is no "first-class main" concept beyond defaults.

## Current State

### Architect singleton

`WorkspaceTerminals` only holds room for one architect terminal per workspace:

```ts
// packages/codev/src/agent-farm/servers/tower-types.ts:33-39
export interface WorkspaceTerminals {
  architect?: string;
  builders: Map<string, string>;
  shells: Map<string, string>;
  fileTabs: Map<string, FileTab>;
}
```

The SQLite mirror enforces the same singleton at the data layer:

```sql
-- packages/codev/src/agent-farm/db/schema.ts:18-26
CREATE TABLE IF NOT EXISTS architect (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  pid INTEGER NOT NULL, ...
  terminal_id TEXT
);
```

### Builder spawn metadata

`Builder` records what kind of work the builder is doing, but **no field captures who spawned it**:

```ts
// packages/codev/src/agent-farm/types.ts:7-19
export interface Builder {
  id: string;
  name: string;
  status: 'spawning' | 'implementing' | 'blocked' | 'pr' | 'complete';
  phase: string;
  worktree: string;
  branch: string;
  type: BuilderType;
  taskText?: string;
  protocolName?: string;
  issueNumber?: number | string;
  terminalId?: string;
}
```

`afx spawn` (`packages/codev/src/agent-farm/commands/spawn.ts:439`) calls `upsertBuilder()` without any spawning-architect identifier.

### Message resolution

`afx send architect "..."` flows through:

1. `commands/send.ts:183` — sender identity is detected from worktree path; defaults to `'architect'` when run from the main workspace.
2. `TowerClient.sendMessage()` POSTs to `/api/send` with a `from` field (`packages/core/src/tower-client.ts:310-346`).
3. `handleSend()` (`packages/codev/src/agent-farm/servers/tower-routes.ts:819-949`) extracts `from` from the request body but **drops it** before calling `resolveTarget(to, workspace)` (`tower-routes.ts:854`). `from` is only used downstream for *message formatting*, not for routing.
4. `resolveAgentInWorkspace` matches `'architect'` or `'arch'` and returns the single `entry.architect` terminal ID (`tower-messages.ts:191-200`).
5. Message is written directly to that terminal's PTY (with idle-aware buffering).

There is **no fan-in stage** that could distinguish multiple architects, because there is only one architect terminal to deliver to — and the resolver currently has no access to sender identity even if there were.

### How users work around it today

- Per-thread markdown files at `codev/<thread-name>-thread.md` with active builder rosters, PR lists, pending decisions, and pickup checklists.
- Cross-architect coordination conventions enforced by discipline ("this thread does NOT approve sibling-thread's gates").
- Mental triage on every `architect` ping ("is this mine?").
- **Manual copy-paste** of builder messages from the main architect's terminal into the sibling architect's terminal — every single ping that conceptually belongs to the sibling has to be relayed by a human. This is the most visible day-to-day cost of the singleton design.

These conventions work but are brittle and require discipline that doesn't scale.

## Desired State

A builder that was spawned by architect **A** should, when running `afx send architect "..."`, deliver the message **only to architect A's terminal**, not to any sibling architects sharing the workspace.

Concretely:

- A workspace can host **multiple architect terminals** simultaneously.
- Each architect terminal has a **name** — a stable identifying string. The name is the architect's identity; there is no separate internal "architectId" field. (Earlier drafts of this spec used `architectId` as a distinct identifier; the architect clarified that the human-readable name *is* the identifier. The spec uses `name` throughout from this point forward.)
- The first architect started in a workspace defaults to the name `main`. Subsequent architects auto-number to `architect-2`, `architect-3`, etc. Either can be overridden with an explicit flag (e.g., `afx architect --name <name>`).
- Every builder spawned during architect A's session records `spawnedByArchitect: A` (the spawning architect's name) in its persisted state.
- `afx send architect "..."` from within a builder worktree resolves the destination using the builder's recorded `spawnedByArchitect` — message goes to that architect's terminal, not to any sibling.
- Existing single-architect workspaces continue to work with **zero behavior change** — the singleton's name defaults to `main`, and builders persisted before this feature route to `main`.

## Scope

### In scope (v1)

1. **Architect name** — a stable string per architect terminal. The first architect started in a workspace defaults to `main`; subsequent architects auto-number (`architect-2`, `architect-3`, …) unless the user supplies an explicit name (e.g., `afx architect --name <name>`). The name is the architect's identity — no separate internal ID. The name is stable across reconnects (shellper restart); only the `terminalId` may change. Routing keys on the name, not the `terminalId`. Allowed character set: `[a-z][a-z0-9-]*`, max length 64.
2. **CLI surface for naming** — v1 introduces enough CLI to start a second (or N-th) named architect terminal in a workspace, and to make the first architect's default name (`main`) auditable. The exact subcommand shape is a plan-phase decision; the architect's example was `afx architect --name <name>`. v1 does **not** add `--architect` filtering to `afx status` or any other UX polish from issue #2.
3. **Multiple architect terminals per workspace** — relax the in-memory and on-disk singletons to allow N architect terminals indexed by name. This touches **all of the following call sites** (the plan phase will enumerate any further occurrences):
   - `WorkspaceTerminals.architect` (`tower-types.ts:35`) — change from `string | undefined` to a collection keyed by architect name.
   - The local `architect` table in `state.db` (`db/schema.ts:18`) — drop `CHECK (id = 1)`; the new primary key is the architect name (`id TEXT PRIMARY KEY`). **No** `workspace_path` column is added — `state.db` is already per-workspace. (Previous draft of this spec was wrong on this point.)
   - The `terminal_sessions` table in `global.db` (`db/schema.ts:94-112`) — for rows where `type = 'architect'`, write the architect's name into the existing `role_id` column. (Schema unchanged; the contract change is "`role_id` is no longer null for architect rows".)
   - `resolveAgentInWorkspace` (`tower-messages.ts:177-200`) — generalize the architect match.
   - The activation guard in `tower-instances.ts:354` (`if (!entry.architect)`) and the architect-create paths at `:416`, `:452`.
   - Architect teardown/iteration sites: `tower-routes.ts:1411` (state response), `:1853-1855` (terminal kill), `:1882-1884` (workspace stop); `tower-instances.ts:529-532` (workspace stop); `tower-terminals.ts:289-290` (terminal cleanup), `:642` (terminal re-attach); `tower-tunnel.ts:74` (architect URL map); `commands/stop.ts:56-59` (CLI stop); `db/migrate.ts:38-46` (state migration); `commands/status.ts:86-89` (CLI status). The plan must visit each.
4. **Spawn-time capture** — `afx spawn` records `spawnedByArchitect` (the spawning architect's name) on the persisted `Builder` row. When `afx spawn` is run from inside a Tower-managed architect terminal, the spawning architect's name is detected automatically (e.g., from an env var Tower injects when starting the architect terminal); when run outside any architect terminal, it defaults to `main`.
5. **Routed `architect` resolution from builders** — the `from` field already arrives at `handleSend()` but is dropped before `resolveTarget()`. v1 plumbs sender identity into the resolution layer (either by widening `resolveTarget`'s signature to accept a sender, or by adding a dedicated builder-context resolution path one layer up). When the sender is a builder, `'architect'` resolves to the builder's recorded `spawnedByArchitect`. When the sender is not a builder (e.g., cron/task routing, manual `architect` sends from outside any builder worktree), `'architect'` resolves to the architect named `main` if present, falling back to the first registered architect if `main` is absent.
6. **Architect-gone semantics** — if a builder's `spawnedByArchitect` points to an architect that is no longer registered (e.g., that architect terminal was killed), `afx send architect` falls back to the architect named `main` if present; if `main` is absent, the send fails with a clear error message naming the missing architect and listing the registered ones. This is distinct from "legacy builder with no `spawnedByArchitect`," which has the same fallback rule but a different error message.
7. **Dashboard / `/api/state` shape** — v1 deliberately keeps the existing `state.architect` scalar shape in the `/api/state` response, populated with the architect named `main` (or the first registered architect if `main` is absent). The dashboard and VSCode extension see a single architect tab, identical to today. Surfacing all architects in the UI is **out of scope** and will be picked up by issue #2 (per-architect identity in spawn + status). This is the explicit decision; the plan must not change it without an amendment to this spec.
8. **Backward compatibility** — workspaces with one architect (no opt-in needed) behave identically to today. Builders persisted before this feature lands (no `spawnedByArchitect` on the row) route to the default `main` architect.

### Explicitly NOT in scope

- **Broadcast / fan-out address.** Earlier drafts of this spec proposed a plural `architects` broadcast address. The architect rejected this as not required for the production workflow that motivated this feature. v1 ships **only** point-to-point routing from a builder to its spawning architect. If a future need for broadcast emerges, it can be added cleanly on top of the named-architect resolution (e.g., a follow-up issue introduces `architects` as a fan-out target).

### Out of scope (deferred to follow-up issues)

The full GitHub issue lists five feature asks. **Only #1 (builder-to-architect message routing) is in scope for v1.** The remaining four are tracked as separate follow-up issues to be filed after this lands:

- **Per-architect identity in spawn + status CLI flags** (#2 in issue): explicit `--architect <name>` on `afx spawn`, `--architect` filter on `afx status`. v1 ships the underlying identity field but does not add CLI flags; identity is detected from execution context only.
- **First-class `THREAD.md` template + lifecycle** (#3 in issue): `codev thread new|list|archive` commands. Pure convention layer, independent of routing.
- **Cross-thread visibility** (#4 in issue): `codev thread show <name>` to read sibling state. Independent of routing.
- **Thread-aware `consult`** (#5 in issue): `consult --thread <name>` or auto-detection from a `.thread` file. Independent of routing.

These five items compose cleanly once #1 lands. Each will be filed as its own follow-up issue with its own protocol after this PR merges.

## Stakeholders

- **Primary**: External Codev consumers running the sibling-architect pattern on large projects (the reporter of #755 plus any future users adopting the pattern).
- **Secondary**: Solo-architect users — must see **zero behavior change**.
- **Technical Team**: Codev maintainers (Tower routing, agent-farm commands, state schema).
- **Business Owners**: M Waleed Kadous (architect role for Codev).

## Success Criteria

- [ ] Two architect terminals can run simultaneously in one workspace (Tower accepts multiple architect registrations with distinct names).
- [ ] The first architect started in a workspace gets the name `main` by default. A second architect started without an explicit name gets `architect-2`; a third gets `architect-3`; and so on. An explicit name supplied via the CLI overrides the default.
- [ ] A builder spawned from architect A's terminal records `spawnedByArchitect: "A"` on its persisted row (or the default `main` when `afx spawn` runs outside any architect terminal).
- [ ] `afx send architect "..."` from inside a builder's worktree routes to **only** the architect that spawned that builder; sibling architects do not receive the message.
- [ ] Existing single-architect workspaces show **no behavior change**: `afx send architect` routes to the lone architect just as it does today, and the `/api/state` response shape is unchanged (scalar `architect`).
- [ ] Builders persisted **before** this feature (no `spawnedByArchitect` field) route to the architect named `main` if present; otherwise fail with a clear error listing the registered architects. The error message is asserted by test.
- [ ] Builders whose `spawnedByArchitect` points to an architect that is no longer registered fall back to `main` if present; otherwise fail with a distinct clear error. Error message is asserted by test.
- [ ] An architect terminal that reconnects after a crash (new `terminalId`, same name) continues to receive its builders' messages without any builder-side change.
- [ ] Non-builder `architect`-targeted sends (e.g., `afx cron`-originated messages, `afx send architect` from the workspace root) continue to route to `main` (or the first registered architect if `main` is absent) — they are **not** affinity-aware.
- [ ] A builder address-spoofing attempt (a builder writing `architect:<some-other-name>` where that name is not its own `spawnedByArchitect`) is rejected with a clear error. Asserted by test.
- [ ] All existing tests pass; new tests cover the routing matrix (single, multi-with-match, legacy-builder-fallback, architect-gone, architect-reconnect, address-spoofing-rejection, auto-numbering of default names).
- [ ] No performance regression in message delivery (single-architect workspaces should see identical latency).
- [ ] State-migration test: a `state.db` produced by the previous schema (singleton architect row, `id = 1`, `terminal_sessions.role_id = NULL` for the architect session) survives the schema upgrade. The architect row is preserved with its `terminal_id`, and the matching `terminal_sessions.role_id` is backfilled to `main`.

## Constraints

### Technical constraints

- **Backward compatibility is non-negotiable.** Single-architect workspaces and pre-existing builder state rows must behave exactly as before. This is the single largest design constraint.
- The architect singleton is enforced in **many places**, not just three. The Scope section enumerates them. They must be relaxed in lockstep — leaving any one of them stuck on the singleton assumption will produce subtle data-loss or routing bugs.
- Tower's in-memory `WorkspaceTerminals` is the source of truth for live routing; the local `state.db` schema must be a faithful mirror for crash recovery, and the global `terminal_sessions` table must encode the architect's name in `role_id` so that crash recovery can restore the multi-architect topology.
- The local `architect` table needs a schema migration: drop `CHECK (id = 1)` and change `id` to `TEXT PRIMARY KEY` storing the architect's name. **No `workspace_path` column is added** — `state.db` is per-workspace already, so workspace scoping is implicit. (Prior consultation flagged that an earlier draft proposed a `workspace_path` column; that was incorrect against the actual schema.)
- The global `terminal_sessions` table does not need a schema change; the migration is a data-shape contract change. Existing rows with `type = 'architect'` and `role_id = NULL` must be backfilled to `role_id = 'main'` so that crash recovery routes legacy single-architect workspaces correctly.
- Architect names follow `[a-z][a-z0-9-]*`, max length 64 chars. The reserved default name is `main`. Auto-numbered defaults follow `architect-<N>` where `<N>` is the smallest integer ≥ 2 not currently in use in the workspace.
- `resolveTarget`'s current signature is `(target, fallbackWorkspace?)` and has no sender parameter. v1 expands the resolution layer to accept the sender's identity. The choice between widening `resolveTarget` itself or adding a sibling builder-context resolver is a plan-phase decision; the spec only requires that sender identity reach the resolution code path.

### Business constraints

- This is upstream work for an external Codev consumer with the sibling-architect pattern in daily production use. **Time-to-merge matters** — keep scope tight.
- Solo-architect users must never have to know this feature exists. No new mandatory CLI flags, no new mandatory config keys.

## Assumptions

- The reporter's workflow uses **two** architect terminals; the design must not collapse on N=2 but does not need to optimize for N=20.
- Architects are launched as Tower terminals (via `afx workspace start` or equivalent); we are not adding a way to register a "remote" or "headless" architect.
- Builder-originated `afx send architect` is the affinity-aware path. Non-builder code paths that target `architect` (e.g., cron-originated messages routed in `tower-cron.ts`, or `afx send architect` invoked from outside any builder worktree) keep the existing "route to the singleton (now `main`)" semantics. Builders cannot be affinity-aware about non-builder senders, so this is the natural fallback.
- The user is willing to add a CLI surface (the architect's example: `afx architect --name <name>`) to start additional named architects. The exact subcommand shape is a plan-phase decision.

## Solution Approach

The mechanism splits naturally into three layers, mirroring how identity flows through the system:

1. **Naming at registration.** When an architect terminal is created, Tower assigns it a name: either the explicit name the user supplied (e.g., `afx architect --name <name>`) or the next available default (`main` for the first, `architect-<N>` for subsequent). The same name survives reconnects — if the architect terminal crashes and shellper restarts it, the new `terminalId` is associated with the same name, and builders' messages keep routing correctly with no builder-side change.
2. **Identity at spawn.** When `afx spawn` creates a builder, it detects the spawning architect's name from execution context (an env var Tower injects when starting the architect terminal is the natural mechanism; plan-phase to confirm) and persists it on the builder row as `spawnedByArchitect`. When run outside any architect terminal, the default `main` is used.
3. **Routing at send.** The `from` field already arrives at `handleSend()` from the request body. v1 plumbs that `from` into the resolution layer so that when the sender is a builder and the target is `architect`, the resolver looks up the builder's `spawnedByArchitect` and returns the matching architect terminal — not the generic first-architect. For non-builder senders, the resolver returns the architect named `main` (or the first registered if `main` is absent).

The plan phase will pin down: the exact CLI shape for naming additional architects (`afx architect --name <name>` is the architect's example, but plan-phase to confirm), the env-var contract that conveys the spawning architect's name into `afx spawn`, the signature change for the resolution layer, and the per-file edit list for the singleton-relaxation sweep.

## Open Questions

### Critical (blocks progress)

*None remaining.* All previously-critical questions resolved during architect review (see below).

### Important (affects design)

- [ ] **Should the architect's name be visible in `afx status`?** Filtering is out of scope for v1, but operators may still want to see "which architect owns which builder." Plan phase to decide whether to add a non-filterable display column now, or defer entirely to issue #2.
- [ ] **Exact CLI shape for naming additional architects.** Architect's example was `afx architect --name <name>`. Plan phase to confirm: is `afx architect` a new noun subcommand (with future room for `afx architect list`, `afx architect kill`, etc.), or a flag on an existing command (e.g., `afx workspace add-architect --name <name>`)? The spec commits to the *capability*, not the surface.
- [ ] **Mechanism for conveying the spawning architect's name into `afx spawn`.** The natural choice is an env var (e.g., `CODEV_ARCHITECT_NAME`) injected by Tower into the architect terminal's shell. Plan phase to confirm and pick the exact var name.

### Resolved (during architect review of iter-1)

- ~~**Whether `architectId` is a separate field from the architect's display name.**~~ Decided: no — the name *is* the identity. Spec renamed `architectId` → architect name throughout.
- ~~**Naming defaults for new architects.**~~ Decided: first = `main`; subsequent auto-numbered (`architect-2`, `architect-3`, …); explicit override via CLI flag.
- ~~**Should v1 ship a broadcast address?**~~ Decided: no. The real workflow doesn't need it. Builders address `architect` (their own spawner) only. If a future need emerges, broadcast can be added cleanly on top of named-architect routing.
- ~~**How does an architect terminal declare its identity?**~~ Decided: via the CLI surface that starts the architect terminal (architect's example: `afx architect --name <name>`). Plan phase fills in the exact subcommand shape.

### Resolved (during consultation iteration 1)

- ~~**Migration shape for the `architect` table.**~~ Decided: drop `CHECK (id = 1)`, change `id` to `TEXT PRIMARY KEY`. No `workspace_path` column; `state.db` is per-workspace.
- ~~**Should the dashboard show all architects in v1?**~~ Decided: no. `/api/state` shape is unchanged; the dashboard sees the `main` architect (or first registered). Multi-architect UI deferred to issue #2.
- ~~**What happens to non-builder `architect` sends (cron, manual)?**~~ Decided: they route to `main` (or first registered if `main` is absent), unchanged from today's effective behavior.
- ~~**What happens when a builder's spawning architect is gone?**~~ Decided: fall back to `main` if present; otherwise fail with a clear error listing registered architects.
- ~~**What happens on architect reconnect (terminalId changes)?**~~ Decided: routing keys on the architect's name, not on `terminalId`. Reconnect is transparent to builders.

### Nice-to-know (optimization)

- [ ] **Should sibling architects see metadata about other architects' builders (read-only)?** Adjacent to issue #4 (cross-thread visibility) which is explicitly deferred. Out of scope for v1.

## Performance Requirements

- **Routing overhead**: a single-architect `afx send architect` must add no measurable latency vs. today (single map lookup → single PTY write).
- **Storage**: per-builder `spawnedByArchitect` is a short string, persisted once at spawn. Negligible.
- **No new background processes, polling loops, or watchers.** All routing is on-demand at message-send time.

## Security Considerations

- **Cross-architect leakage**: a misrouted message could expose builder activity to a sibling architect who shouldn't see it. Three rules guarantee no leak across architects:
  1. **Legacy builder (no `spawnedByArchitect`)** → route to `main`; if `main` is absent, fail with error `"legacy builder <id> has no spawning-architect identity and no 'main' architect is registered (registered: <list>)"`. Asserted by test.
  2. **Architect-gone (`spawnedByArchitect` points to a no-longer-registered architect)** → route to `main`; if `main` is absent, fail with error `"builder <id> was spawned by architect <missing-name>, which is no longer registered, and no 'main' architect is registered (registered: <list>)"`. Asserted by test.
  3. **Cross-architect addressing rejected**: a builder cannot bypass routing by writing `architect:<other-name>` as the target. The send rejects with `"builder <id> may only address its own spawning architect"`. Asserted by test.
- No new auth surfaces, no new credentials, no new tokens.

## Test Scenarios

### Functional

1. **Single-architect baseline (regression).** One architect (`main`) + one builder. `afx send architect "hi"` from builder reaches `main`. Identical to current behavior. `/api/state` response shape is unchanged.
2. **Two architects, scoped routing.** Architects `main` and `sibling`. Builder spawned from `main`. `afx send architect "hi"` reaches only `main`'s terminal, never `sibling`'s.
3. **Auto-numbered second architect.** Starting a second architect with no explicit name yields `architect-2`. Starting a third yields `architect-3`. Skipping `architect-2` (start, kill, restart) does not reuse the gap; `architect-3` is still next. (Plan phase decides whether to reuse gaps; spec only requires the smallest-unused-integer behavior described in Constraints.)
4. **Explicit name override.** Starting an architect with an explicit name (e.g., `afx architect --name sibling`) yields the supplied name. Re-using an already-registered name in the same workspace is rejected with a clear error.
5. **Legacy builder fallback (`main` present).** Builder row in DB has no `spawnedByArchitect`. `afx send architect` from that builder reaches `main`.
6. **Legacy builder fallback (`main` absent).** Same row, but no architect named `main` is registered. Send fails with the legacy-builder error message; the error text is asserted verbatim.
7. **Architect-gone (`main` present).** Builder has `spawnedByArchitect: "sibling"` but `sibling` is no longer registered. `main` is registered. Send reaches `main`.
8. **Architect-gone (`main` absent).** Same row, no `main` either. Send fails with the architect-gone error message; the error text is asserted verbatim, including the missing architect name and the list of registered architects.
9. **Architect reconnect.** Architect `sibling` is killed and recreated (new `terminalId`, same name). The builder spawned from `sibling` sends `afx send architect`; the message reaches the new terminal without any builder-side change.
10. **Spawning-architect detection.** `afx spawn` run from inside `main`'s architect terminal records `spawnedByArchitect: "main"`. Run from `sibling`'s architect terminal records `spawnedByArchitect: "sibling"`. Run outside any architect terminal defaults to `"main"`.
11. **Address-spoofing rejection.** A builder spawned by `main` tries to address `architect:sibling`. Rejected; error text asserted verbatim.
12. **Non-builder architect-target sends.** `afx send architect "hi"` invoked from the workspace root (not inside any builder worktree), in a multi-architect workspace, reaches `main`. Cron-originated architect messages route the same way.
13. **Workspace stop with multiple architects.** Workspace stop tears down **all** registered architect terminals, not just the first.

### Non-functional

1. **Latency parity.** Microbenchmark `afx send architect` in a single-architect workspace before and after the change. No statistically significant difference.
2. **Migration safety — local `state.db`.** Migration that drops `CHECK (id = 1)` and changes the `architect` table primary key to `TEXT` preserves the existing singleton row, rekeys its `id` to `main`, and preserves its `terminal_id` binding.
3. **Migration safety — global `terminal_sessions`.** Backfill that populates `role_id = 'main'` for existing rows where `type = 'architect' AND role_id IS NULL` runs idempotently and leaves non-architect rows untouched.

## Dependencies

- **Internal systems**: Tower instance manager, agent-farm CLI (`afx send`, `afx spawn`), SQLite state schema, `resolveTarget` logic, builder state model.
- **External services**: none.
- **Libraries / frameworks**: none new.

## References

- GitHub issue #755 (full multi-architect ask, all 5 features).

**Singleton homes (must all be relaxed in lockstep):**
- `packages/codev/src/agent-farm/servers/tower-types.ts:33-39` — `WorkspaceTerminals` interface.
- `packages/codev/src/agent-farm/db/schema.ts:18-26` — local `architect` table.
- `packages/codev/src/agent-farm/db/schema.ts:94-112` — global `terminal_sessions` table (`role_id` contract).
- `packages/codev/src/agent-farm/servers/tower-messages.ts:177-200` — `resolveAgentInWorkspace`.
- `packages/codev/src/agent-farm/servers/tower-instances.ts:354,416,452,529-532` — activation guard, create paths, teardown.
- `packages/codev/src/agent-farm/servers/tower-routes.ts:1411-1418,1853-1855,1882-1884` — `/api/state` shape, terminal kill, workspace stop.
- `packages/codev/src/agent-farm/servers/tower-terminals.ts:289-290,642` — terminal cleanup and re-attach.
- `packages/codev/src/agent-farm/servers/tower-tunnel.ts:74` — architect URL map.
- `packages/codev/src/agent-farm/commands/stop.ts:56-59` — CLI stop.
- `packages/codev/src/agent-farm/commands/status.ts:86-89` — CLI status.
- `packages/codev/src/agent-farm/db/migrate.ts:38-46` — state migration.

**Data model touch points:**
- `packages/codev/src/agent-farm/types.ts:7-19` — `Builder` interface (where `spawnedByArchitect` will live).
- `packages/codev/src/agent-farm/types.ts:37-41` — `ArchitectState` (needs `name`).
- `packages/codev/src/agent-farm/types.ts:43-48` — `DashboardState.architect` (scalar shape preserved in v1).
- `packages/codev/src/agent-farm/state.ts:75-111` — `upsertBuilder()` (records `spawnedByArchitect`).

**Message flow:**
- `packages/codev/src/agent-farm/commands/send.ts:142-223` — afx send flow.
- `packages/codev/src/agent-farm/commands/spawn.ts:439` — `upsertBuilder()` call site.
- `packages/codev/src/agent-farm/servers/tower-routes.ts:819-949` — `handleSend`; `from` is dropped at line 854 before `resolveTarget`.
- `packages/core/src/tower-client.ts:310-346` — `TowerClient.sendMessage` (already propagates `from`).

## Risks and Mitigation

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Backward compat break for solo-architect users | Medium | High | Default architect name of `main`; legacy builder rows route to `main`; comprehensive regression test on the single-architect path. |
| Migration drops the singleton row on schema upgrade | Low | High | Two migration tests (local `state.db` + global `terminal_sessions` backfill); both asserted to preserve `terminal_id` and rekey the row's `id`/`role_id` to `main`. |
| Singleton-relaxation sweep misses a call site, leaking single-architect assumption | Medium | High | Enumerated list of known call sites in Scope item 3 + References. Plan phase must visit each. CI grep guardrail: a test that fails if `entry.architect` (singular accessor) appears outside the documented allowed sites. |
| Dashboard / VSCode extension breaks due to `/api/state` shape change | Medium | High | v1 explicitly preserves the scalar shape of `state.architect` in `/api/state` (Scope item 7). The collection lives only inside Tower; the response is collapsed to `main` (or first) on the way out. |
| Routing leaks across architects under race conditions (two architects spawning builders at the same instant) | Low | Medium | Spawn-time identity is captured synchronously from the spawning architect's environment, persisted to SQLite in the same transaction as `upsertBuilder()`. No race window. |
| CLI naming surface ends up needing to grow before v1 ships | Low | Medium | Architect committed in iter-2 review to a minimal CLI (the example given was `afx architect --name <name>`). Plan phase to confirm the exact shape; spec keeps the surface intentionally small. |
| Scope creep — pressure to include thread.md (#3), `--architect` filter on `afx status` (#2), or broadcast | High | Medium | Explicit Out of Scope section above; architect explicitly rejected broadcast in iter-2 review. Any pressure during PR review → defer to follow-up issue. |

## Expert Consultation

**Date**: 2026-05-17
**Models Consulted**: Gemini 3 Pro, GPT-5 Codex, Claude Opus 4.7

### Verdicts (iteration 1)

| Model | Verdict | Confidence |
|-------|---------|------------|
| Codex | REQUEST_CHANGES | HIGH |
| Gemini | REQUEST_CHANGES | HIGH |
| Claude | COMMENT | HIGH |

### Convergent findings (addressed in this iteration)

1. **Migration text was wrong.** The original draft proposed a `(workspace_path, architect_id)` uniqueness constraint on the `architect` table; both Codex and Gemini correctly pointed out that `state.db` is per-workspace and has no `workspace_path` column. **Fix**: drop `CHECK (id = 1)` and change `id` to `TEXT PRIMARY KEY`. Updated in Scope (item 2) and Constraints.
2. **More singleton homes than listed.** All three models flagged additional call sites beyond the three I'd enumerated. Codex named `DashboardState.architect`, `ArchitectState`, `InstanceStatus.architectUrl`, `loadState/setArchitect`. Gemini named `terminal_sessions.role_id` in `global.db`. Claude named the activation guard at `tower-instances.ts:354`, workspace stop at `tower-routes.ts:1882-1884`, `tower-tunnel.ts:74`. **Fix**: enumerated all known call sites in Scope (item 2) and References; framing changed from "three places" to "many places."
3. **`resolveTarget` has no sender context.** All three models pointed out that `from` is dropped at `handleSend` before reaching `resolveTarget`. **Fix**: Solution Approach now explicitly requires plumbing `from` into the resolution layer; Constraints calls out the signature change is a plan-phase decision (widen `resolveTarget` vs. add a sibling resolver).
4. **Broadcast syntax must avoid `project:agent` collision.** Codex and Gemini flagged that `architect:all` collides with the existing parser. **Fix**: pinned `architects` (plural, no colon) in Scope (item 5); marked the Open Question as resolved.

### Codex-specific findings (addressed)

- **Non-builder `architect` sends (cron/task).** Codex flagged that the assumption "no other code path uses `architect` as a target" is false (`tower-cron.ts` formats messages addressed to `architect`). **Fix**: Assumptions section rewritten; Scope (item 4) explicitly states non-builder senders keep the existing semantics.
- **Legacy fallback rule needed sharper success criteria.** **Fix**: Success Criteria now requires asserted error text for legacy-builder and architect-gone fallbacks.

### Gemini-specific findings (addressed)

- **`terminal_sessions` (global.db) is a fourth singleton home.** Currently `role_id` is `null` for architect rows. **Fix**: Scope (item 2) requires populating `role_id` with `architectId`; Success Criteria includes a global-DB migration test; Constraints notes the data-shape contract change.

### Claude-specific findings (addressed)

- **Dashboard / `/api/state` shape change.** Claude noted that changing `state.architect` from scalar to a collection would break the dashboard and VSCode extension. **Fix**: Scope (item 7) explicitly decides to keep `/api/state` scalar in v1, populated with `main` (or first); multi-architect UI deferred to issue #2.
- **Activation guard at `tower-instances.ts:354`.** **Fix**: included in the singleton-home enumeration in Scope (item 2).
- **Architect-gone vs. legacy builder edge case.** **Fix**: distinguished in Scope (item 6) and Security Considerations; separate test scenarios and separate error messages.
- **Architect reconnect (terminalId changes).** **Fix**: Scope (item 1) and Solution Approach (layer 1) explicitly state routing keys on `architectId`, not `terminalId`; test scenario added.

### Persisted consultation outputs

- `codev/projects/755-multi-architect-support-per-ar/755-specify-iter1-codex.txt`
- `codev/projects/755-multi-architect-support-per-ar/755-specify-iter1-gemini.txt`
- `codev/projects/755-multi-architect-support-per-ar/755-specify-iter1-claude.txt`
- `codev/projects/755-multi-architect-support-per-ar/755-specify-iter1-rebuttals.md`

### Architect review (iteration 2) — 2026-05-18

The architect (M Waleed Kadous) reviewed the spec and left five inline comments. All five were addressed in this iteration:

1. **Problem statement accuracy.** Today, only the singleton architect terminal receives a builder's message — a sibling architect agent isn't a Tower-registered architect at all, so it doesn't get the message directly. The original draft incorrectly said "both" architects see it. **Fix**: Problem Statement rewritten to describe the singleton's actual behavior plus the human's manual copy-paste workaround.
2. **Naming policy.** The architect specified concrete defaults: first architect = `main`; subsequent = auto-numbered (`architect-2`, `architect-3`, …); explicit override via a CLI flag (architect's example: `afx architect --name <name>`). **Fix**: pinned in Scope item 1, with character-set/length rules in Constraints, and test scenarios for auto-numbering + explicit name + collision rejection.
3. **Workaround reality.** The architect literally copy-pastes messages from main's terminal to sibling's. **Fix**: added explicitly to "How users work around it today" as the most visible day-to-day cost.
4. **`architectId` is the same as the name.** **Fix**: renamed throughout. Builder field is now `spawnedByArchitect` (the architect's name); there is no separate ID.
5. **Broadcast is not required.** **Fix**: dropped the `architects` broadcast address from v1 scope entirely. Added explicit "NOT in scope" subsection. Removed associated tests, success criteria, and security carve-outs. Left a forward-looking note that broadcast can be added cleanly on top of named-architect routing if a future need emerges.

## Approval

- [ ] Architect review (M Waleed Kadous)
- [ ] Multi-agent consultation complete (Gemini, Codex, Claude)
- [ ] Spec-approval gate (porch)

## Notes

The architect's spawn-time directive was unambiguous: scope to feature #1 only. Items #2-5 are intentionally left as follow-up issues, even though some (especially #2, per-architect identity in spawn CLI flags) compose so directly with #1 that they'd be a small additional lift. The discipline of keeping v1 tight matters more than the incremental polish, and the spec keeps that line firmly.
