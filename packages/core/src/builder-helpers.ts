import type { OverviewBuilder } from '@cluesmith/codev-types';

/**
 * Threshold (ms) for treating a builder as "idle, likely waiting on input".
 *
 * If Tower last received output from the builder's shellper longer than this
 * ago — and the builder isn't blocked at a gate or completed — it's likely
 * paused at a clarifying question. 5 minutes is conservative enough that
 * legitimate long agent "thinking" pauses rarely false-positive, but short
 * enough that a real wait surfaces while the user is still on-task.
 *
 * Lives here (not in `@cluesmith/codev-types`) because it's *application
 * policy* — the UI rule for interpreting `lastDataAt`. The types
 * package describes the wire contract; this constant decides what the
 * VSCode extension and the web dashboard *do* with it. Co-locating both
 * surfaces' threshold here prevents silent UI drift where one says
 * "waiting" and the other says "active" for the same builder.
 */
export const IDLE_WAITING_THRESHOLD_MS = 5 * 60 * 1000;

/**
 * True iff the builder is silent past `IDLE_WAITING_THRESHOLD_MS` while
 * still being able to make progress (not blocked at a gate, not
 * completed/verified, and Tower has a `lastDataAt` timestamp for it).
 *
 * Canonical predicate for the third "needs me" state alongside `blocked`.
 * UI surfaces should call this rather than reimplementing the threshold
 * check.
 */
export function isIdleWaiting(b: OverviewBuilder, now: number = Date.now()): boolean {
  if (b.blocked) { return false; }
  if (b.phase === 'complete' || b.phase === 'verified') { return false; }
  if (!b.lastDataAt) { return false; }
  return now - new Date(b.lastDataAt).getTime() > IDLE_WAITING_THRESHOLD_MS;
}

/**
 * Pick the single group an issue / builder belongs to, per the area-grouping
 * convention shared by the dashboard backlog view (#811) and the vscode
 * builders tree (#818).
 *
 * Resolution order:
 *  - `'cross-cutting'` if `area/cross-cutting` is present (multi-area work
 *    by intent — never bucketed under one of its constituent areas)
 *  - the first alphabetical area otherwise (`areas` is already sorted by
 *    `parseAreaLabels`, so `areas[0]` is the lexicographically smallest)
 *  - `'Uncategorized'` if no `area/*` labels at all
 *
 * Lives here (not in `@cluesmith/codev-types`) because it's *application
 * policy* — the rule the UI applies when projecting a `string[]` of areas
 * to a single grouping bucket. Co-locating the policy here prevents silent
 * drift where the dashboard says "Auth" and vscode says "cross-cutting"
 * for the same multi-area builder.
 */
export function resolvePrimaryArea(areas: string[]): string {
  if (areas.includes('cross-cutting')) return 'cross-cutting';
  return areas[0] ?? 'Uncategorized';
}
