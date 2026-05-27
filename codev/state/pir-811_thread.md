# pir-811 thread

## 2026-05-27 — plan phase

Read issue #811 (group backlog by area). Investigated:
- `OverviewBacklogItem.area: string` already on the wire (added by #819).
- `parseArea` (singular) is policy-free — does NOT privilege `area/cross-cutting` (explicit decision + regression test in #819).
- `parseAreaLabels` (plural) does NOT exist. The "helper issue" referenced as Related in #811 was #819, which CLOSED with a different shape (singular projection on the server, no resolvePrimaryArea helper).

Design tension: AC #2 wants cross-cutting in its own top group, but the singular `area` field can't distinguish `[area/cross-cutting]` from `[area/auth, area/cross-cutting]` (the latter projects to `auth`).

Resolution chosen: lean on the issue body's own convention guidance — "Tag it `area/cross-cutting` only (don't list every individual area)". Under this convention, singular `area === 'cross-cutting'` is sufficient detection. Avoids re-litigating #819's wire-shape decision. Documented the alternative (`crossCutting: boolean` or `areas: string[]`) in the plan's Risks section as a follow-up if the convention proves brittle.

Plan written to `codev/plans/811-vscode-group-backlog-by-area.md`. Ready for plan-approval gate.
