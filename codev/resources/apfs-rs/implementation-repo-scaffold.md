# APFS-RS Implementation Repository Scaffold

Document version: 0.3.0  
Status: Draft  
Date: 2026-06-23

## Purpose

This file converts the APFS-RS planning context into an executable repository scaffold. The first implementation repository should be created with enough structure for humans, CI, and coding agents to work safely before APFS parser code is added.

## Scaffold goals

1. Make the repository immediately buildable.
2. Make Codev context first-class.
3. Make agent instructions visible at the root.
4. Make machine-readable registries schema-validated.
5. Make CI enforce safety and traceability from day one.
6. Make the first APFS implementation slice narrow: `apfs inspect` for a simple synthetic image.

## Initial repository tree

```text
apfs-rs/
├── AGENTS.md
├── CLAUDE.md
├── Cargo.toml
├── Justfile
├── LICENSE-APACHE
├── LICENSE-MIT
├── README.md
├── SECURITY.md
├── codev/
│   ├── specs/apfs-rs/
│   ├── plans/apfs-rs/
│   ├── reviews/apfs-rs/
│   └── resources/apfs-rs/
├── crates/
│   ├── apfs-types/
│   ├── apfs-blockdev/
│   ├── apfs-core/
│   ├── apfs-read/
│   ├── apfs-vfs/
│   ├── apfs-cli/
│   └── apfs-test/
├── fuzz/
│   ├── Cargo.toml
│   └── fuzz_targets/
├── fixtures/
│   └── README.md
├── tools/
│   ├── macos-fixtures/
│   └── mutate-fixtures/
├── xtask/
│   ├── Cargo.toml
│   └── src/main.rs
└── .github/
    ├── copilot-instructions.md
    ├── instructions/
    ├── workflows/
    ├── ISSUE_TEMPLATE/
    ├── pull_request_template.md
    └── dependabot.yml
```

## Initial crates

Start with fewer crates than the long-term architecture, but keep boundaries clear.

| Crate | First responsibility | Safety policy |
|---|---|---|
| `apfs-types` | On-disk primitive types, object IDs, feature flags, checksum helpers | `#![forbid(unsafe_code)]` |
| `apfs-blockdev` | Read-only image block device and offset views | `#![forbid(unsafe_code)]` |
| `apfs-core` | APFS container superblock parser and checkpoint discovery | `#![forbid(unsafe_code)]` |
| `apfs-read` | Initially empty facade for future file read work | `#![forbid(unsafe_code)]` |
| `apfs-vfs` | Initially empty facade for future mount adapters | `#![forbid(unsafe_code)]` |
| `apfs-cli` | `apfs inspect` vertical slice | safe Rust; `anyhow` allowed here only |
| `apfs-test` | Fixture manifest helpers | `#![forbid(unsafe_code)]` |

Delay these until the corresponding specs are active:

- `apfs-win`
- `apfs-compress`
- `apfs-crypto`
- `apfs-write`
- `apfs-fuse`
- `apfs-android`
- `apfs-ffi`

## Initial Cargo workspace

```toml
[workspace]
members = [
  "crates/apfs-types",
  "crates/apfs-blockdev",
  "crates/apfs-core",
  "crates/apfs-read",
  "crates/apfs-vfs",
  "crates/apfs-cli",
  "crates/apfs-test",
  "xtask",
]
resolver = "2"

[workspace.package]
edition = "2024"
license = "MIT OR Apache-2.0"
rust-version = "1.88"
repository = "https://github.com/OWNER/apfs-rs"

[workspace.lints.rust]
unsafe_code = "forbid"

[workspace.lints.clippy]
all = "deny"
pedantic = "warn"
```

The `rust-version` and toolchain should be checked before implementation begins and adjusted to the actual minimum supported Rust version the maintainers choose.

## First vertical slice

The first implementation slice should be:

```text
M-001 + partial M-003:
  Read a file source as a block device.
  Parse candidate APFS container superblock fields.
  Validate basic object/header structure where possible.
  Print `apfs inspect --json`.
  Refuse truncated/corrupt input with typed errors.
```

Required outputs:

```bash
apfs inspect fixtures/simple-unencrypted-case-sensitive-001.apfs --json
cargo xtask capability-check M-001
cargo xtask fixture-check simple-unencrypted-case-sensitive-001
```

## Root README first paragraph

```markdown
# APFS-RS

APFS-RS is a clean-room Rust implementation for APFS inspection, extraction, mounting, and eventually carefully gated write support. The first milestone is Windows read-only APFS inspection, extraction, and mount support for synthetic images and external APFS volumes. Write support is disabled by default and begins only in a disposable-image lab.
```

## Bootstrap sequence

1. Create repository and licences.
2. Copy Codev APFS context pack.
3. Copy agent instruction templates to root and `.github/`.
4. Add Cargo workspace and empty crates.
5. Add `xtask` with registry/schema checks.
6. Add GitHub workflows.
7. Add fixture registry and schemas.
8. Add first synthetic fixture generation script.
9. Implement `apfs inspect` vertical slice.
10. Require CI green before expanding scope.

## Do not add initially

- Windows mount code before CLI inspect/list works.
- Compression before regular uncompressed file read works.
- Crypto before read-only core is robust.
- Write code before the write-lab spec is accepted.
- GUI before CLI UX stabilises.
- Raw physical write code at all before beta governance approval.
