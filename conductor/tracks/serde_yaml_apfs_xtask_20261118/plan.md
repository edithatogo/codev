# Plan — Conductor planning: qualify YAML adapter in Codev APFS Rust tooling

- [ ] Identify live `apfs-rs/xtask/src/main.rs` YAML call sites, the mirrored template call sites, fixture corpus, feature matrix, toolchain and source-of-truth generator.
- [ ] Compare unmaintained adapter to maintained alternatives for error types/locations, duplicate keys, YAML tags/aliases, scalar precision, Unicode, malformed/oversized input, MSRV, advisories and dependency cost.
- [ ] If justified, change both `apfs-rs/xtask` and the matching `codev/resources` source template via the original Codev/SPIR workflow; avoid direct edit of generated hot context files.
- [ ] Exact-head `xtask` tests, template-instantiation parity, plugin generation, Rust lint/build, rights/security and CI checks required before merge; no-go is valid. Preserve pre-existing APFS read/write safety and source provenance.

