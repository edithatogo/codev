/**
 * Successor-session resolution — map a logical terminal session to its current
 * (post-restart) terminal id.
 *
 * After a Tower restart, persistent terminal sessions (builders and architects)
 * are reconnected under a **new** terminal id and the old SQLite row is deleted.
 * A client tab still holding the old id's WebSocket URL gets a permanent close
 * (`classifyUpgradeError` → `'permanent'`, see `reconnect-policy`). The old id is
 * gone, so the only way back is to re-resolve the **successor** id from fresh
 * workspace state and reconnect there.
 *
 * The successor is never found by mapping old-id → new-id (the old id is deleted
 * from state). It is found by **stable session identity** → current `terminalId`:
 * a builder keeps its `id`, an architect keeps its `name`, and only the
 * `terminalId` field changes across the restart.
 *
 * Pure logic over the shared `DashboardState` wire type, consumed where a host
 * holds a dead terminal id and needs the live one (the VS Code terminal's
 * give-up recovery). Sibling to `classifyUpgradeError` / `BackoffController` —
 * the cross-host terminal-reconnect logic that lives in core so every surface
 * agrees on the rule (#961, #971).
 *
 * Scope: only **builder** and **architect** sessions are persistent and
 * restart-reconciled, so only those are part of {@link SessionRef}. Shell/dev
 * terminals do not survive a restart and have no successor to resolve.
 */

import type { DashboardState } from '@cluesmith/codev-types';
import { resolveAgentName } from './agent-names.js';

/** A stable reference to a persistent terminal session, independent of its
 *  (restart-mutable) terminal id. */
export type SessionRef =
  | { kind: 'builder'; id: string }
  | { kind: 'architect'; name: string };

/** The slice of workspace state {@link resolveSuccessorTerminalId} needs. */
type SessionState = Pick<DashboardState, 'builders' | 'architects'>;

/**
 * Given fresh workspace state and a stable session reference, return the
 * current (successor) `terminalId`, or `null` if the session is no longer
 * present (or has no live terminal).
 *
 * - `builder`: matched via {@link resolveAgentName} so bare numeric ids
 *   (e.g. `'153'`) tail-match canonical `builder-<protocol>-<n>` ids, exactly
 *   as the VS Code builder-open path resolves them today.
 * - `architect`: matched by exact stable `name` (`'main'` or a sibling name).
 */
export function resolveSuccessorTerminalId(
  state: SessionState,
  ref: SessionRef,
): string | null {
  if (ref.kind === 'builder') {
    const { builder } = resolveAgentName(ref.id, state.builders ?? []);
    return builder?.terminalId ?? null;
  }
  const architect = (state.architects ?? []).find((a) => a.name === ref.name);
  return architect?.terminalId ?? null;
}
