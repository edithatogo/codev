# PIR #989 — guarded-command feedback (modal-first / ephemeral-after)

## Plan phase

Issue: vscode guarded commands go silent after the first "run setup" toast because
`setupToastShown` is a one-shot session suppressor. Want point-of-action feedback on
every click: modal first time, ephemeral status-bar message thereafter.

Key code:
- `packages/vscode/src/preflight/preflight.ts:244-261` — `showSetupRequiredToast` + `setupToastShown`
- `packages/vscode/src/preflight/preflight.ts:176-181` — flag reset on recheck→ok
- `packages/vscode/src/extension.ts:526-529` — `guard` wrapper calls the toast
- `packages/vscode/src/preflight/preflight-core.ts` — pure logic home (unit-tested)

Design: extract a reusable `showPreflightFeedback` helper; pure wording derivation in
preflight-core for testability; modal-vs-ephemeral chosen by a session flag that resets
on recheck→ok (unchanged semantics). Sets up #983 reuse (Tower dimension).

Wrote plan to `codev/plans/989-vscode-guarded-command-feedbac.md`. Awaiting plan-approval.
