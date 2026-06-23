# APFS-RS Unsafe Code Policy

Document version: 0.2.0  
Status: Draft  
Date: 2026-06-23

## Policy

APFS-RS should be safe Rust by default. Core crates should use:

```rust
#![forbid(unsafe_code)]
```

Unsafe code is allowed only when a safe alternative is not practical and the unsafe boundary is narrow, documented, tested, and reviewed.

## Expected unsafe locations

| Area | Expected? | Notes |
|---|---:|---|
| `apfs-types` | Avoid if possible | Prefer explicit endian-safe parsing. Any zero-copy parsing needs review. |
| `apfs-core` | Avoid | Parsing logic should be safe and bounds-checked. |
| `apfs-read` | No | High-level filesystem semantics should not need unsafe. |
| `apfs-compress` | Avoid | Prefer safe compression libraries. |
| `apfs-crypto` | Avoid | Secret handling should use reviewed crates/APIs. |
| `apfs-write` | No | Transaction logic should be safe Rust. |
| `apfs-win` | Yes | FFI to WinFsp/Windows APIs. |
| `apfs-fuse` | Possibly | FFI to FUSE/macFUSE if binding requires it. |
| `apfs-ffi` | Yes | Public C ABI if added later. |

## Unsafe review block

Every unsafe block must have an adjacent comment or review record:

```markdown
## Unsafe review

- Location:
- Why unsafe is required:
- Safe alternatives considered:
- Invariant:
- Caller obligations:
- What could go wrong:
- Tests:
- Miri status:
- Reviewer:
```

## Required gates

- `cargo clippy -- -D warnings`.
- Miri for reachable unsafe-adjacent tests where practical.
- Fuzz-smoke for parser code around unsafe parsing boundaries.
- CODEOWNERS review by the responsible maintainer.
- Security-maintainer review for FFI, crypto, raw-device, or write-adjacent unsafe.

## Forbidden patterns

- `mem::transmute` for on-disk APFS structs without ADR approval.
- Creating references into unaligned on-disk byte buffers.
- Assuming APFS block/device alignment without checks.
- Panicking on corrupt input.
- Exposing raw pointers across crate boundaries unless the crate is explicitly FFI.
- Hiding unsafe helper functions behind safe APIs without documenting invariants.

## Agent rule

Coding agents must not add unsafe code unless the issue explicitly includes an accepted unsafe-code task packet and the resulting PR includes the unsafe review block.
