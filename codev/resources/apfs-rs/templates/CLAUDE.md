# APFS-RS Agent Instructions

Template version: 0.2.0  
Intended location in implementation repo: `CLAUDE.md`  
Status: Template for future `apfs-rs` repository

## Prime directive

This is filesystem software. Prefer safe refusal over best-effort behaviour. Never add, enable, or simulate physical-device write support unless the task explicitly links to an accepted write-safety spec, an accepted plan, and the image-only write-lab evidence gate.

## Required context before coding

Before changing code, read:

1. The linked Codev spec.
2. The linked Codev plan.
3. The relevant row in `codev/resources/apfs-rs/capabilities.yaml`.
4. The relevant safety gates in `codev/resources/apfs-rs/safety-gates.yaml`.
5. The relevant fixture entries in `codev/resources/apfs-rs/fixtures.yaml`.
6. Any path-specific instructions in `.github/instructions/`.

## Standard implementation loop

1. Identify the smallest vertical slice.
2. Add or update a fixture/manifest before or with the implementation.
3. Implement in platform-neutral crates unless the task is explicitly platform-specific.
4. Add typed errors for corrupt or unsupported APFS states.
5. Add tests, fuzz-smoke coverage, and documentation updates.
6. Update the capability matrix and machine-readable registries.
7. Add a Codev review note with lessons and follow-up work.

## Forbidden without explicit maintainer approval

- Raw-disk or physical-device writes.
- New `unsafe` code.
- New production dependencies.
- New cryptography dependencies.
- Key extraction, password recovery, password cracking, or access-control bypass.
- Write support for encrypted, sealed, damaged, Fusion/multi-device, or unknown-feature APFS states.
- Copying implementation code from GPL/LGPL APFS projects into permissive core crates.
- Large generated fixture images committed to Git without fixture-governance approval.

## Rust quality defaults

Run the repo command facade when available:

```bash
just agent-check
```

Equivalent minimum commands:

```bash
cargo fmt --all -- --check
cargo clippy --workspace --all-targets --all-features -- -D warnings
cargo nextest run --workspace --all-features
cargo deny check
cargo audit
```

Parser or unsafe-code changes may require:

```bash
cargo fuzz run <target> -- -max_total_time=60
cargo +nightly miri test
cargo llvm-cov nextest --workspace --all-features
cargo mutants --in-diff
cargo kani
```

## Default crate safety policy

All core crates should default to:

```rust
#![forbid(unsafe_code)]
```

Unsafe code belongs only in narrow adapter/FFI crates or explicitly reviewed parsing boundaries, with a documented invariant and a review checklist.

## APFS behaviour policy

- Unknown incompatible feature: diagnostic only for read, hard refusal for write.
- Checksum mismatch: diagnostic only unless a future forensic mode explicitly permits partial extraction.
- Unsupported encryption: metadata only, no unlock attempt.
- Hardware-bound internal-device encryption: unsupported.
- Fusion/multi-device: diagnostic only until a dedicated spec exists.
- Write mode: image-only lab until evidence gates pass.

## Commit and PR requirements

Every PR must identify:

- Issue.
- Spec.
- Plan.
- Capability IDs.
- Fixtures added/updated.
- Tests run.
- Safety gates affected.
- Dependencies added or confirmed unchanged.
- Unsafe code added or confirmed unchanged.
- Compatibility matrix changes.

## Agent-specific warning

Do not infer permission to modify unsafe, crypto, raw-device, or write code from a broad task description. If scope is ambiguous, implement the read-only or diagnostic-only path and record the write/security work as a follow-up issue.
