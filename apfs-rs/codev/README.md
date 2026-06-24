# APFS-RS Codev Workspace

This implementation workspace is Codev-driven.

## Current phase

- Spec: first read-only implementation slice.
- Plan: `codev/plans/0001-m001-inspect.md`.
- Implementation: Rust workspace under `crates/`.
- Review: `codev/reviews/0001-bootstrap-review.md`.

## Rules

- Every capability must map to `codev/resources/capabilities.yaml`.
- Every safety-sensitive path must map to `codev/resources/safety-gates.yaml`.
- All implementation starts read-only.
- Write support requires a future accepted write-lab spec.
