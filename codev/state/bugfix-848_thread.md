# bugfix-848 thread

## Investigation

Issue #848: `verify-install.mjs` still probes the removed `af` bin (CI red since #847 merged), and it has never probed `afx` either.

- Confirmed root cause: `packages/codev/scripts/verify-install.mjs:35` lists `'af'` but not `'afx'`.
- Confirmed no other references to `'af'` remain under `.github/` or `packages/codev/scripts/` via `grep -rn "'af'"`.
- `packages/codev/package.json` bin map has `afx` (not `af`), so probing `afx` is the right replacement.

## Fix

Single-line change: `['codev', 'af', 'porch', 'consult']` → `['codev', 'afx', 'porch', 'consult']`.

No regression test is added: the script is itself the CI verification test. Changing the list IS the regression guard — the post-install workflow on `main` will fail again immediately if the bin list ever drifts from the bin map.

## Next

Run porch done → 3-way review → PR.
