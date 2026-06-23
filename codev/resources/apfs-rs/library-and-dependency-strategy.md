# APFS-RS Library and Dependency Strategy

Document version: 0.1.0  
Status: Draft  
Date: 2026-06-23  
Codev phase: Plan resource

## Strategy

Use dependencies where they reduce risk, but keep the APFS on-disk model and transaction semantics inside the project. Dependency adoption must be deliberate because filesystem tooling is security-sensitive and write support can cause data loss.

Guiding rules:

1. Prefer small, well-maintained crates with compatible licences.
2. Avoid transitive dependency sprawl in core crates.
3. Keep platform bridges isolated behind adapter crates.
4. Require licence, maintenance, unsafe-code, and supply-chain review before adoption.
5. Pin versions through `Cargo.lock` for applications and CI.
6. Use `cargo deny`, `cargo audit`, `cargo vet`, Dependabot, and review checklists.
7. Do not copy implementation code from GPL/LGPL APFS projects into permissive core crates.

## Candidate dependency categories

| Area | Candidate libraries/tools | Suggested posture |
|---|---|---|
| Binary parsing | `zerocopy`, `bytemuck`, `binrw`, `winnow`, manual endian-safe readers | Prefer manual/`zerocopy` for fixed structs; benchmark parser ergonomics before committing. |
| Endianness/bytes | `byteorder`, `bytes`, `zerocopy` | Keep minimal; APFS structures need explicit endianness. |
| UUIDs | `uuid` | Accept if licence and MSRV fit. |
| Bit flags | `bitflags` | Accept; useful for APFS feature flags. |
| Error handling | `thiserror`, `anyhow` | `thiserror` in libraries; `anyhow` only in CLI/tests. |
| CLI | `clap`, `anstream`, `anstyle`, `supports-color` | Use `clap` derive for user-facing commands. |
| Structured output | `serde`, `serde_json`, `schemars` | JSON output should be stable and schemaable. |
| Logging/tracing | `tracing`, `tracing-subscriber`, `tracing-error` | Mandatory structured logs with redaction policy. |
| Compression | `flate2`, `libz-rs`/zlib backend options, LZFSE/LZVN candidates | Choose after corpus tests and licence review. |
| Crypto | `zeroize`, `secrecy`, `subtle`, audited KDF/AES crates | Adopt only with security review; avoid home-grown crypto primitives. |
| Windows APIs | `windows` / windows-rs | Preferred for Win32 APIs and raw-device handling. |
| WinFsp bridge | WinFsp C API via FFI/bindgen/shim | Primary Windows mount bridge; isolate unsafe boundary. |
| Dokany bridge | Dokany FFI or FUSE wrapper | Secondary adapter only if justified. |
| FUSE | `fuser`, `fuse3`, libfuse-compatible adapters | Evaluate after Windows MVP; keep behind `apfs-fuse`. |
| Async/runtime | `tokio` optional | Avoid runtime in core crates; adapter crates may use it. |
| Caching | `lru`, `moka`, custom bounded cache | Prefer simple bounded cache first; measure before adding complexity. |
| Path handling | `camino`, platform-specific path adapters | Useful for UTF-8 internal paths; handle Windows edge cases carefully. |
| Temp files/tests | `tempfile`, `assert_cmd`, `predicates`, `insta`, `rstest` | Use broadly in test crates. |
| Property tests | `proptest`, `arbitrary`, `bolero` | Core metadata and transaction plans should be property-tested. |
| Fuzzing | `cargo-fuzz`, `libfuzzer-sys`, `afl` optional | Required for metadata parsers and crypto/keybag parsing. |
| Coverage | `cargo-llvm-cov` | Required in CI. |
| Mutation testing | `cargo-mutants` | Scheduled or manual quality gate. |
| Supply-chain | `cargo-deny`, `cargo-audit`, `cargo-vet`, `cargo-semver-checks` | Required in CI and release process. |
| Formal checks | `kani`, `miri`, `loom` | Use selectively for unsafe code, concurrency, and transaction invariants. |

## Bleeding-edge watchlist as of 2026-06-23

This list should be refreshed before implementation begins.

| Candidate | Current signal | Use case | Decision status |
|---|---|---|---|
| WinFsp | Windows user-mode filesystem bridge; supports native, FUSE2, FUSE3, and .NET APIs | Primary Windows mount bridge | Prefer for MVP. |
| Dokany | Windows user-mode filesystem library with FUSE wrapper | Secondary Windows bridge | Keep optional. |
| libfuse | Reference Linux FUSE userspace library | Linux/ChromeOS/macOS-style mount architecture | Use indirectly through Rust adapter where possible. |
| macFUSE | macOS FUSE-style user-mode filesystem package | macOS parity/testing adapter | Later; macOS native APFS is validation oracle. |
| `fuser` 0.17.x | Rust FUSE userspace library implementation | Linux/macOS adapter candidate | Evaluate after Windows MVP. |
| `fuse3` 0.9.x | Async Rust FUSE3 library | Linux async adapter candidate | Evaluate after Windows MVP; docs/build status must be checked. |
| `windows` 0.62.x | Rust for Windows bindings | Windows raw-device and API integration | Prefer. |
| `lzfse_rust` 0.2.x | Rust LZFSE implementation | LZFSE compression candidate | Evaluate against APFS corpus and licence. |
| `zeroize`/`secrecy` | Secret handling | Software-encryption read support | Likely required. |
| `cargo-vet` | Dependency review/audit trail | Supply-chain governance | Required before public releases. |
| `cargo-semver-checks` | API compatibility | Public crates | Required before release tags. |
| GitHub artifact attestations | Release provenance | Signed release pipeline | Later release gate. |

## Dependency evaluation checklist

Every non-dev dependency must have an ADR or dependency review entry covering:

- Purpose and alternatives.
- Licence compatibility.
- Maintenance status.
- Transitive dependencies.
- MSRV impact.
- Unsafe code usage.
- Security advisories.
- Platform support.
- Performance implications.
- Removal/migration plan.

## Parser strategy

APFS parsing should prefer explicitness over cleverness.

### Recommended pattern

- Define typed newtypes for object IDs, transaction IDs, block numbers, byte offsets, and feature flags.
- Parse fixed-size headers with endian-aware reads.
- Validate object type and subtype before interpreting payloads.
- Avoid unaligned references to on-disk bytes unless a crate explicitly makes this safe.
- Keep byte slices tied to lifetimes where possible; copy only when needed.
- Centralise checksum validation.
- Treat unknown compatible features as readable with caution and unknown incompatible features as hard blockers for writes.

### Unsafe code policy

Unsafe code is allowed only when:

1. No safe alternative is practical.
2. The unsafe boundary is small and isolated.
3. The safety invariants are documented beside the code.
4. Miri or equivalent tests are added where applicable.
5. At least one maintainer review explicitly covers the unsafe block.

Likely unsafe areas:

- FFI to WinFsp/Dokany/libfuse/macFUSE.
- Windows raw-device APIs.
- Possible zero-copy parsing helpers.

Unsafe code should not appear in high-level APFS semantics or transaction logic.

## Compression strategy

Compression should be isolated in `apfs-compress` behind a trait:

```rust
pub trait Decompressor {
    fn method(&self) -> CompressionMethod;
    fn decompress(&self, input: &[u8], expected_size: usize) -> Result<Vec<u8>, DecompressError>;
}
```

Implementation rules:

- Validate expected size and reject expansion beyond configured limits.
- Support streaming variants for large files.
- Test every method against APFS fixtures, not just generic compression round trips.
- Keep unknown methods discoverable in metadata but unreadable until implemented.

## Crypto strategy

`apfs-crypto` should be narrow and conservative.

Rules:

- No custom cryptographic primitives.
- Use audited crates or OS APIs only after review.
- Secrets use zeroising containers.
- Logs and diagnostics redact secret-bearing values.
- Hardware-bound internal-device cases remain unsupported until a safe documented path exists.

## Windows bridge strategy

### Preferred path

1. Use WinFsp as the primary adapter.
2. Prototype with the smallest FFI surface needed for read-only operations.
3. Consider a small C shim if direct Rust FFI becomes brittle.
4. Keep all WinFsp-specific types in `apfs-win`.
5. Expose only `apfs-vfs` operations to the adapter.

### Read-only operations required first

- init/mount.
- getattr/stat.
- lookup/open.
- read.
- readdir.
- readlink where supported.
- statfs.
- explicit refusal for create/write/truncate/delete/rename/setattr.

## Linux/macOS/ChromeOS FUSE strategy

- Do not start this before Windows read-only MVP unless it helps test the core.
- Choose between `fuser` and `fuse3` after comparing API maturity, async needs, platform support, maintenance, and testability.
- Keep FUSE semantics in `apfs-fuse`; core code should not know about FUSE.

## Android strategy

- Start as a library and app integration layer.
- Provide extraction/browsing APIs for app UI.
- Avoid assumptions about mount privileges.
- Treat raw-device access as device- and policy-dependent.

## Supply-chain controls

Minimum controls for implementation repo:

```text
cargo deny check
cargo audit
cargo vet
cargo semver-checks
cargo tree --duplicates
cargo geiger or cargo scan equivalent for unsafe review signal
```

Dependabot should monitor:

- Cargo dependencies.
- GitHub Actions.
- Docker images if any.
- npm dependencies only if docs or GUI tooling introduces them.

## Dependency update policy

- Patch updates: automated PRs, normal CI.
- Minor updates: automated PRs plus fixture smoke tests.
- Major updates: manual review, changelog review, and compatibility check.
- Security updates: prioritised; may bypass normal batching if CI passes.

## Rejected dependency patterns

Avoid:

- Large framework dependencies in core crates.
- Async runtime dependency in core crates.
- Unmaintained parser libraries for core metadata.
- GPL/LGPL libraries linked into permissive core without explicit project-level licence decision.
- Bindings that require global mutable state unless isolated in adapter crates.

## ADRs to create next

1. ADR-0001: Parser approach for fixed APFS structs.
2. ADR-0002: WinFsp binding strategy.
3. ADR-0003: FUSE Rust adapter selection.
4. ADR-0004: Compression library selection.
5. ADR-0005: Crypto dependency and key-handling strategy.
6. ADR-0006: Dependency governance and cargo-vet workflow.
