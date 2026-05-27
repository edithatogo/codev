import { resolve } from 'node:path';
import { homedir } from 'node:os';

export const DEFAULT_TOWER_PORT = 4100;
export const AGENT_FARM_DIR = resolve(homedir(), '.agent-farm');

/**
 * Fallback `area` value emitted by the server when an issue or builder has
 * no `area/*` label (or — for builders — no associated issue). The single
 * source of truth so the parser default, the server-side initializer for
 * builders pending issue-cache enrichment, and any downstream UI filter or
 * matcher all agree on the literal.
 */
export const UNCATEGORIZED_AREA = 'Uncategorized';
