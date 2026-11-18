# Specification — Conductor planning: qualify YAML adapter in Codev APFS Rust tooling

## Current source
- The Codev project is governed by its Codev/SPIR instructions; this track is subordinate, not a new maintainer hierarchy.
- Nested `apfs-rs` Cargo and `xtask` manifests use Serde, JSON and `serde_yaml`; the corresponding generated template exists under `codev/resources/apfs-rs/templates/xtask`. The source tree and template must remain consistent.
- The unmaintained YAML format adapter is a conditional replacement candidate. Neither Serde traits nor a new YAML parser replaces APFS binary parsing, filesystem safety, or generated framework configuration.

## Decision
Compare maintained Serde-compatible `serde-saphyr` and `yaml_serde` for the *actual xtask* read/write contracts, not a global automatic dependency migration. Preserve Codev generated HOT/COLD governance source-of-truth and do not modify generated AGENTS/CLAUDE.md. No Dioryx/APFS upstream integration is authorized by a parser change.
