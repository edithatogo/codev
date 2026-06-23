# Spec 0003: APFS-RS Capabilities Matrix

Document version: 0.1.0  
Status: Draft  
Date: 2026-06-23  
Codev phase: Specify

## Status legend

- **MVP** — required for Windows read-only MVP.
- **R1** — advanced read milestone.
- **R2** — software-encryption read milestone.
- **W-Lab** — image-only write laboratory milestone.
- **W-Beta** — restricted Windows external-volume write beta.
- **Later** — later cross-platform or advanced capability.
- **Excluded** — explicitly out of scope unless a later spec changes this.

## Container and block-device capabilities

| Capability | Target | Windows | Linux | macOS | Android | ChromeOS | Risk | Acceptance criteria |
|---|---|---|---|---|---|---|---|---|
| APFS container detection in disk image | MVP | Yes | Later | Later | Later | Later | Medium | Detect block size, NX magic, feature flags, and checkpoint area. |
| APFS container detection on Windows block device | MVP | Read-only | Later | Later | Limited | Limited | High | Open device read-only; do not obtain write handles; report permission errors clearly. |
| GPT partition discovery | MVP | Yes | Later | Later | Limited | Limited | Medium | Locate APFS partition/container by GUID and offset. |
| Checkpoint selection | MVP | Yes | Yes | Yes | Yes | Yes | High | Select newest internally consistent checkpoint; explain fallback. |
| Object checksum validation | MVP | Yes | Yes | Yes | Yes | Yes | High | Detect corrupt metadata and refuse unsafe operation. |
| Object map lookup | MVP | Yes | Yes | Yes | Yes | Yes | High | Resolve object IDs to physical blocks for selected checkpoint. |
| Space manager read | R1 | Yes | Yes | Yes | Yes | Yes | High | Report allocation summary and support write-preflight analysis. |
| Space manager mutation | W-Lab | Image only | Image only | Image only | No | No | Critical | Randomized image-write tests remain mountable and consistent. |
| Multi-device/Fusion containers | Later | Diagnostic only initially | Diagnostic only initially | Diagnostic only initially | No | No | Critical | Dedicated spec required. |

## Filesystem read capabilities

| Capability | Target | Risk | Acceptance criteria |
|---|---|---|---|
| Volume enumeration | MVP | Medium | List volumes with UUID, name, role, encryption state, and safety status. |
| Volume superblock parsing | MVP | High | Parse and validate volume metadata from fixture corpus. |
| Root filesystem tree traversal | MVP | High | Walk tree without panics, loops, or unchecked bounds. |
| Directory listing | MVP | Medium | Stable entry ordering option and correct file types. |
| Regular file read | MVP | High | Extract bytes matching macOS-generated hash manifest. |
| Symlink read | MVP | Medium | Expose target through CLI and mount adapter where possible. |
| Hard link read | MVP | Medium | Preserve identity where represented; avoid duplicate extraction surprises. |
| Sparse file read | R1 | Medium | Return holes as zero ranges; preserve sparse information in metadata. |
| Clone/reflink detection | R1 | Medium | Report shared extents and avoid double-counting logical/physical sizes. |
| Case-sensitive lookup | R1 | Medium | Honour volume behaviour in path resolver. |
| Case-insensitive lookup | R1 | High | Correct Unicode normalisation/casefold policy or refuse ambiguity. |
| Unicode name handling | MVP/R1 | High | Deterministic conversion; no silent lossy path mapping. |
| Large files | MVP | Medium | Streaming reads without loading full file into memory. |
| Permission metadata | MVP/R1 | Medium | Read POSIX mode/ownership; map conservatively on Windows. |
| ACL metadata | Later | High | Dedicated spec for NFSv4 ACL mapping and Windows ACL projection. |

## Metadata and extended-data capabilities

| Capability | Target | Risk | Acceptance criteria |
|---|---|---|---|
| Basic timestamps | MVP | Medium | Created/modified/accessed/change timestamps exposed when available. |
| Extended attributes list/read | R1 | Medium | CLI lists and extracts xattrs with byte-identical values. |
| Resource forks | R1 | Medium | CLI extracts resource fork and Finder metadata variants explicitly. |
| Finder info | R1 | Medium | Expose as metadata/xattr; do not invent Windows semantics. |
| File flags | R1 | Medium | Expose immutable/hidden/etc. flags in CLI diagnostics. |
| Compression metadata | R1 | High | Detect compression type and storage form. |

## Compression capabilities

| Capability | Target | Risk | Acceptance criteria |
|---|---|---|---|
| Uncompressed extents | MVP | Medium | Byte-identical extraction. |
| ZLIB compressed data | R1 | Medium | Decompress corpus files and verify hashes. |
| LZVN compressed data | R1 | High | Decompress corpus files and verify hashes. |
| LZFSE compressed data | R1 | High | Decompress corpus files and verify hashes. |
| Unknown compression method | MVP | Medium | Refuse file read with actionable error; continue listing metadata. |
| Streaming decompression | R1 | Medium | Avoid unbounded memory use for large files. |

## Snapshot capabilities

| Capability | Target | Risk | Acceptance criteria |
|---|---|---|---|
| Snapshot discovery | R1 | High | List snapshots with identifiers and timestamps where available. |
| Snapshot read-only mount | R1 | High | Mount/extract from selected snapshot without affecting live view. |
| Snapshot diff | Later | Medium | Report changed paths between snapshots. |
| Snapshot creation | Later/W-Lab only | Critical | Requires write transaction spec and image-only proof first. |
| Snapshot deletion | Later/W-Lab only | Critical | Requires space accounting and crash-consistency proof. |

## Encryption-related capabilities

| Capability | Target | Risk | Acceptance criteria |
|---|---|---|---|
| Detect encrypted volumes | MVP | Medium | Show encrypted status and refuse read until supported. |
| User-supplied software unlock | R2 | Critical | Valid test fixtures open and read; invalid secrets fail safely. |
| Recovery-key support for documented software paths | R2 | Critical | Supported documented path with secure input handling. |
| Keybag parsing | R2 | Critical | Fuzzed and reviewed; no panics or key leakage. |
| Key zeroisation | R2 | High | Secrets use zeroizing types and redacted logs. |
| Hardware-bound internal-device encryption | Excluded | Critical | Report unsupported clearly; no unsupported access workflow. |
| Credential recovery tooling | Excluded | Critical | Not implemented; no roadmap item. |

## Write capabilities

| Capability | Target | Risk | Acceptance criteria |
|---|---|---|---|
| Transaction design document | W-Lab | Critical | All mutated structures listed per operation. |
| Disposable image creation | W-Lab | High | Create image that macOS can mount/verify. |
| File create/write/truncate | W-Lab | Critical | Randomized operations survive crash injection. |
| File delete | W-Lab | Critical | Space accounting and tree updates remain consistent. |
| Directory create/delete | W-Lab | Critical | Directory invariants hold after remount. |
| Rename | W-Lab | Critical | Atomicity tested across interruption points. |
| Xattr write | W-Lab | High | Byte-identical xattr round trip on images. |
| Checkpoint writer | W-Lab | Critical | Old or new checkpoint valid after simulated crash, never mixed state. |
| Windows image read-write mount | W-Lab/W-Beta | Critical | Explicit lab flag; images only at first. |
| Windows external-volume write beta | W-Beta | Critical | Opt-in, exclusive lock, preflight verifier, refusal on unsupported states. |
| Encrypted write | Later | Critical | Dedicated security and transaction spec required. |
| Repair | Later | Critical | Dedicated verifier and recovery design required. |
| Format | Later | High | Dedicated format spec and interoperability tests required. |

## Platform adapter capabilities

| Platform | Adapter | Initial target | Notes |
|---|---|---|---|
| Windows | WinFsp | MVP | Primary adapter; user-mode filesystem; no custom kernel driver. |
| Windows | Dokany | Could/Later | Secondary adapter if WinFsp limitations appear or community demand justifies it. |
| Linux | FUSE/libfuse via Rust adapter | Later | Reuse `apfs-vfs`; no APFS logic duplication. |
| macOS | macFUSE or native test harness | Later | Primarily for validation and parity tests. |
| Android | Rust library + app access layer | Later | Avoid assumptions about root, raw devices, or mount privileges. |
| ChromeOS | CLI plus FUSE where available | Later | Support depends on developer/Linux environment and device policy. |

## CLI capabilities

| Command | Target | Purpose |
|---|---|---|
| `apfs inspect <source>` | MVP | Container metadata, checkpoint state, feature flags, safety status. |
| `apfs volumes <source>` | MVP | Volume list and roles. |
| `apfs ls <source>:/Volume/path` | MVP | Directory listing. |
| `apfs cat <source>:/Volume/path/file` | MVP | Stream file to stdout. |
| `apfs extract <source>:/Volume/path <dest>` | MVP | Extract files/directories. |
| `apfs mount <source> <mountpoint> --readonly` | MVP | Mount selected volume read-only. |
| `apfs verify-read <source> --manifest manifest.json` | MVP | Compare file hashes and metadata against fixture manifest. |
| `apfs dump-tree <source>` | MVP/R1 | Debug filesystem tree and object map. |
| `apfs xattr list/read` | R1 | Extended attribute access. |
| `apfs snapshots` | R1 | Snapshot listing. |
| `apfs unlock` | R2 | Software-encryption unlock flow. |
| `apfs image create` | W-Lab | Disposable image creation. |
| `apfs-lab mount-rw` | W-Lab | Explicit image-only write mount. |

## Automation capabilities

| Capability | Target | Acceptance criteria |
|---|---|---|
| GitHub Actions CI | MVP | Matrix builds for Linux/macOS/Windows where possible. |
| Format/lint | MVP | `cargo fmt --check`, strict clippy, rustdoc warnings. |
| Unit/integration tests | MVP | Core parser and fixture tests required. |
| Fuzz smoke | MVP | Short fuzz-smoke job. |
| Scheduled deep fuzz | R1 | Nightly/weekly longer fuzz jobs. |
| Dependency scanning | MVP | `cargo audit`, `cargo deny`, Dependabot, and licence review. |
| Code scanning | MVP | CodeQL where applicable and SARIF upload for Rust tools that emit SARIF. |
| Coverage | MVP/R1 | `cargo llvm-cov` threshold and trend artifact. |
| Release automation | Later | Signed binaries, SBOM, checksums, attestation. |
| Fixture generation | MVP/R1 | macOS-generated fixture manifests and redacted test corpus metadata. |

## Capability documentation rule

Every capability must have:

1. A spec or spec section.
2. A plan with tasks and test gates.
3. A compatibility matrix entry.
4. CI evidence or a manual validation note.
5. A review update after implementation.
