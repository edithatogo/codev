# APFS-RS

APFS-RS is a clean-room Rust implementation for APFS inspection, extraction, mounting, and eventually carefully gated write support.

**Current status:** implementation has started with a safe Rust workspace and the first read-only inspection slice. This is not yet a full APFS driver or mount tool.

## First milestone

The first functional milestone is `M-001` plus partial `M-003`:

```bash
cargo run -p apfs-cli -- inspect --json <source>
```

This command opens a source file read-only, probes block zero for an APFS container superblock, parses basic `nx_superblock_t` fields, and emits stable JSON.

## Safety posture

- Read-only by default.
- No physical-device write support.
- No encryption bypass or password recovery.
- No unsafe code in core crates.
- Unsupported APFS states are reported as typed errors or diagnostic-only states.

## Codev

The implementation repo is Codev-driven. See `codev/README.md` and the specs/plans/reviews under `codev/`.
