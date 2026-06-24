# Plan 0003: First Implementation Sprint

Document version: 0.4.0  
Status: Draft  
Date: 2026-06-24  
Codev phase: Plan

## Goal

Move APFS-RS from planning/scaffold into real development without overreaching. The first sprint should produce a buildable Rust workspace, policy checks, and the smallest APFS inspection slice.

## Non-goals

- Windows mount support.
- File extraction.
- Compression.
- Encryption.
- Write support.
- Repair or format.
- Raw physical disk writes.

## Sprint outcomes

1. Dedicated `apfs-rs` implementation repository exists.
2. Root agent instructions are installed from templates.
3. Cargo workspace builds on Linux, Windows, and macOS.
4. `cargo xtask registry-check` validates the APFS registries.
5. `cargo xtask safety-check` performs initial unsafe/write/dependency policy checks.
6. `apfs inspect --json <source>` command exists.
7. `apfs inspect` can read a file source read-only and run an APFS container probe scaffold.
8. First synthetic APFS fixture-generation script is planned or implemented.
9. CI runs on pull requests and merge queue.

## Task breakdown

| Task | Description | Acceptance |
|---|---|---|
| T1 | Create implementation repo scaffold | README, licences, Cargo workspace, AGENTS, CLAUDE, `.github` templates. |
| T2 | Add safe Rust crate skeleton | `apfs-types`, `apfs-blockdev`, `apfs-core`, `apfs-cli`, `apfs-test`, `xtask`. |
| T3 | Add read-only image source | Open file read-only, read ranges, report size, reject out-of-range reads. |
| T4 | Add APFS probe scaffold | Detect likely APFS container magic in a first-block probe, with clear “scaffold” status. |
| T5 | Add CLI JSON output | `inspect --json` emits schema version, source info, probe result, and safety status. |
| T6 | Add registry validation | JSON Schema validation for YAML registries. |
| T7 | Add initial safety check | Detect unsafe code and suspicious physical-write terms. |
| T8 | Add CI | `fmt`, `clippy`, tests, docs, registry check, safety check. |
| T9 | Add first fixture plan | Synthetic APFS image creation script plan and manifest schema. |
| T10 | Add sprint review | Record what was built, what remains scaffolded, and next APFS parsing tasks. |

## Agent task packet for T3

```markdown
## Capability
M-001

## Goal
Implement a read-only image block device.

## Read first
- `codev/resources/apfs-rs/capabilities.yaml`
- `codev/resources/apfs-rs/safety-gates.yaml`
- `codev/resources/apfs-rs/unsafe-code-policy.md`

## Must not change
- raw physical-device access
- write APIs
- unsafe code

## Acceptance
- range reads work
- out-of-range reads return typed error
- no writes are exposed
- tests pass
```

## Success criteria

The sprint is complete when the implementation repo can run:

```bash
cargo fmt --all -- --check
cargo clippy --workspace --all-targets --all-features -- -D warnings
cargo test --workspace
cargo xtask registry-check
cargo xtask safety-check
cargo run -p apfs-cli -- inspect --json fixtures/example.bin
```

The final command may report “not APFS” for placeholder fixtures until the first real macOS-generated APFS image is added.

## Next sprint

The second sprint should replace the APFS probe scaffold with real container superblock parsing against a synthetic APFS fixture and macOS oracle manifest.
