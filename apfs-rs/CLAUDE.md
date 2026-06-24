# APFS-RS Agent Instructions

## Prime directive

This is filesystem software. Prefer safe refusal over best-effort behaviour. Never add, enable, or simulate physical-device write support unless the task explicitly links to an accepted write-safety spec, an accepted plan, and the image-only write-lab evidence gate.

## Required context before coding

Before changing code, read:

1. The linked Codev spec.
2. The linked Codev plan.
3. `codev/resources/capabilities.yaml`.
4. `codev/resources/safety-gates.yaml`.
5. Any path-specific instructions in `.github/instructions/`.

## Forbidden without explicit maintainer approval

- Raw-disk or physical-device writes.
- New low-level memory-risk code.
- New production dependencies.
- New cryptography dependencies.
- Key extraction, password recovery, password cracking, or access-control bypass.
- Write support for encrypted, sealed, damaged, Fusion/multi-device, or unknown-feature APFS states.

## Standard checks

```bash
cargo fmt --all -- --check
cargo clippy --workspace --all-targets --all-features -- -D warnings
cargo test --workspace
cargo xtask registry-check
cargo xtask safety-check
```
