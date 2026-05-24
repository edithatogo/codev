#!/usr/bin/env node

// af - DEPRECATED: use afx instead
import { runAgentFarm } from '../dist/agent-farm/cli.js';

process.stderr.write('⚠ `af` is deprecated. Use `afx` instead.\n');

runAgentFarm(process.argv.slice(2)).catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
