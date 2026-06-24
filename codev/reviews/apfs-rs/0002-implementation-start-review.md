# Review 0002: Implementation Start Review

Document version: 0.4.0  
Status: Implementation-start review  
Date: 2026-06-24  
Codev phase: Review

## What changed

A nested `apfs-rs/` implementation workspace was added to the Codev repository. It contains:

- Rust workspace manifest.
- APFS-RS README.
- Agent instructions.
- Codev implementation workspace with spec, plan, review, capability registry, safety gates, and schemas.
- Initial `apfs-types` parser for APFS object headers and the first `nx_superblock_t` fields.
- Initial `apfs-core` inspection report logic.
- Initial `apfs-cli inspect --json` command.
- `xtask` automation scaffold.
- Nested GitHub workflow templates.

## Codev setup status

The implementation workspace has its own Codev loop:

- `apfs-rs/codev/specs/0001-m001-inspect.md`
- `apfs-rs/codev/plans/0001-m001-inspect.md`
- `apfs-rs/codev/reviews/0001-bootstrap-review.md`
- `apfs-rs/codev/resources/capabilities.yaml`
- `apfs-rs/codev/resources/safety-gates.yaml`
- `apfs-rs/codev/resources/schemas/*.json`

## Functional status

Started, but still early:

- `apfs-types` can parse `obj_phys_t`-style header fields and basic `nx_superblock_t` fields from bytes.
- `apfs-core` can produce a structured inspect report from bytes.
- `apfs-cli` can read a file source and call the inspect logic.

Not implemented yet:

- Fletcher checksum validation.
- Checkpoint selection.
- Object map lookup.
- B-tree traversal.
- Volume enumeration.
- File extraction.
- Windows mount adapter.
- Compression.
- Encryption.
- Write support.

## Safety review

No write support was added. No Windows raw-device access was added. The implementation remains read-only and diagnostic-only.

## Known limitations

The code was authored and packaged in an environment that does not have Rust/Cargo installed, so it still needs compilation and CI validation in a Rust-enabled environment.

## Next action

Run CI in the implementation workspace, fix compiler/lint issues, then add a synthetic APFS fixture generated from macOS and use it to validate real APFS container-superblock parsing.
