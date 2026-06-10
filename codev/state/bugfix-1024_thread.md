# bugfix-1024 — CLI preflight 400ms timeout false "CLI missing"

## Investigate

Issue #1024: `VERSION_TIMEOUT_MS = 400` in `packages/vscode/src/preflight/preflight.ts:42`
is too tight. On slow envs (remote SSH, WSL, nvm shims, AV scanning) the `codev --version`
probe exceeds 400ms → `decidePreflight` returns `missing` → walkthrough opens, Status row
sticks at `missing`, guarded commands no-op. Root cause confirmed by reading the source: the
budget value, not the resolver chain.

### Fix shape (mechanical, per issue)
1. Bump default 400 → 5000ms.
2. New setting `codev.cliVersionTimeoutMs` (number, default 5000, min 100, max 60000) in
   `package.json`, read by the preflight via `getConfiguration('codev')`.
3. Log a `[Preflight]` line to the OutputChannel when the cap fires (timeout), naming the
   value + recovery action.
4. Unit test `runCodevVersion` honours explicit `timeoutMs`; default falls back when unset.

### Key design decision
`runCodevVersion` is **vscode-free** (only `spawn` + timer). Importing `preflight.ts` for a
unit test would drag in `EventEmitter` (constructed at module load), `TowerClient`,
`tower-starter` — fragile. So I relocate `runCodevVersion` + a pure `resolveVersionTimeout`
helper + the timeout constants into `preflight-core.ts` (loads only `node:path`). The probe
is unchanged (not rewritten — out-of-scope respected), just moved to the file the project
already unit-tests under vitest. Added a `timedOut` flag to the return so the glue can log
the timeout case distinctly from spawn-error / non-zero-exit.
