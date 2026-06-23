# APFS-RS Agent Skills

Document version: 0.2.0  
Status: Draft future agent-skill pack  
Date: 2026-06-23

## Purpose

Reusable agent skills should package narrow workflows for common APFS-RS tasks. They complement `AGENTS.md`: `AGENTS.md` is always-on repository guidance, while skills are task-specific workflows an agent can invoke when the task matches.

## Proposed skills

| Skill | Trigger | Output |
|---|---|---|
| `apfs-parser-change` | Parser, object header, checkpoint, OMAP, B-tree, extent work | Safe parser workflow, fuzz target reminder, fixture check list. |
| `apfs-fixture-addition` | New APFS feature fixture | Fixture manifest, generation script checklist, oracle commands. |
| `apfs-windows-mount-change` | WinFsp, Windows mount, raw-device read-only | Windows smoke checklist and refusal tests. |
| `apfs-dependency-review` | New crate/tool/library | Dependency review record and policy check. |
| `apfs-unsafe-review` | `unsafe` appears in diff | Unsafe review block and Miri/checklist. |
| `apfs-write-safety-review` | `apfs-write` or write behaviour | Transaction, crash-injection, refusal matrix checklist. |
| `apfs-release-readiness` | Release or tag preparation | Compatibility, SBOM, provenance, changelog, fixture evidence checklist. |

## Example skill: parser change

```markdown
# Skill: apfs-parser-change

Use when editing APFS on-disk parsing code.

## Steps

1. Identify capability IDs.
2. Read parser ADR.
3. Add valid and corrupt input tests.
4. Add/update fuzz target.
5. Confirm no unreviewed unsafe.
6. Update fixture/capability registries.
7. Run `just agent-core-read-check`.
8. Add review note.
```

## Example skill: write-safety review

```markdown
# Skill: apfs-write-safety-review

Use when a task touches `crates/apfs-write`, transaction planning, checkpoint writing, or write mode UX.

## Steps

1. Confirm task is image-only or accepted beta.
2. Check `safety-gates.yaml`.
3. List mutated APFS objects.
4. Add failure-injection points.
5. Verify old/new checkpoint invariant.
6. Update refusal matrix.
7. Require write-safety maintainer review.
```

## Packaging recommendation

In the future implementation repo, store skills under a tool-specific location only after deciding the agent platform. Until then, keep skill definitions in `codev/resources/apfs-rs/agent-skills.md` and reference them from `AGENTS.md`.
