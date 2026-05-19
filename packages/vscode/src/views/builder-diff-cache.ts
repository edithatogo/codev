import {
  getBuilderChanges,
  planResources,
  type ChangeEntry,
  type ResourcePlan,
} from '../commands/view-diff.js';

/**
 * A changed file paired with its diff plan. `planResources` maps
 * `changes` 1:1 in order, so zipping by index is safe.
 */
export interface BuilderFileChange {
  change: ChangeEntry;
  plan: ResourcePlan;
}

export interface BuilderDiffResult {
  /** Merge-base SHA (or branch name) — passed to `diffUrisForChange`. */
  baseRef: string;
  /** Empty when there are no changes. */
  files: BuilderFileChange[];
  /** Present when `git` failed; the tree shows a placeholder row. */
  error?: string;
}

/**
 * TTL cache around `getBuilderChanges` keyed by builder id.
 *
 * Why: VSCode re-queries an *expanded* tree node's children on every
 * `onDidChangeTreeData` — which `BuildersProvider` fires on each SSE event
 * and the 60s overview poll. Without a cache, every tick would spawn `git`
 * for every expanded builder. The TTL caps that to ~1 spawn / interval /
 * expanded builder; collapsed builders never call `getChildren` at all.
 */
export class BuilderDiffCache {
  private readonly cache = new Map<string, { ts: number; result: BuilderDiffResult }>();

  constructor(private readonly ttlMs = 15_000) {}

  async getDiff(builderId: string, worktreePath: string): Promise<BuilderDiffResult> {
    const hit = this.cache.get(builderId);
    if (hit && Date.now() - hit.ts < this.ttlMs) {
      return hit.result;
    }

    let result: BuilderDiffResult;
    try {
      const { baseRef, changes, binaryPaths } = await getBuilderChanges(worktreePath);
      const plans = planResources(changes, binaryPaths);
      result = {
        baseRef,
        files: changes.map((change, i) => ({ change, plan: plans[i]! })),
      };
    } catch (error) {
      result = {
        baseRef: '',
        files: [],
        error: error instanceof Error ? error.message : String(error),
      };
    }

    this.cache.set(builderId, { ts: Date.now(), result });
    return result;
  }

  /** Drop a builder's cached diff (e.g. after cleanup). */
  invalidate(builderId: string): void {
    this.cache.delete(builderId);
  }
}
