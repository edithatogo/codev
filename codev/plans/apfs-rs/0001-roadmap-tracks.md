# Plan 0001: APFS-RS Roadmap Tracks

Document version: 0.1.0  
Status: Draft  
Date: 2026-06-23  
Codev phase: Plan

## Planning principle

The roadmap is organised as parallel tracks, but delivery should happen through vertical slices that produce working CLI or mount behaviour plus tests. The first public value is Windows read-only APFS access; write support is deliberately delayed until the image-only write lab has strong evidence.

## Track A — Governance, safety, and project setup

### Goal

Create the project foundation before implementation begins.

### Deliverables

- Project charter.
- Licence policy.
- Clean-room policy.
- Contribution guide.
- Safety policy.
- Compatibility matrix.
- ADR template.
- Security policy.
- Initial GitHub labels and issue templates.

### Initial issues

1. Create repository skeleton and Codev structure.
2. Add `MIT OR Apache-2.0` licence decision for core crates.
3. Add clean-room and dependency review policy.
4. Add safety policy for raw devices and write support.
5. Add initial compatibility matrix.
6. Add issue and PR templates aligned to SPIR.

### Acceptance gates

- Every document has version metadata.
- `CHANGELOG.md` tracks planning changes.
- First 20 implementation issues link to specs and plans.

## Track B — APFS read-only core

### Goal

Implement enough APFS parsing to inspect containers, enumerate volumes, list directories, and extract simple files from unencrypted, uncompressed images.

### Work packages

1. `apfs-types`: endian-safe object headers, IDs, UUIDs, flags, checksums.
2. `apfs-blockdev`: image backend, offset partition backend, read cache.
3. `apfs-core`: container superblock parsing.
4. `apfs-core`: checkpoint discovery and selection.
5. `apfs-core`: object map lookup.
6. `apfs-core`: B-tree node parser.
7. `apfs-read`: volume superblock parsing.
8. `apfs-read`: directory traversal.
9. `apfs-read`: file extents and streaming reads.
10. `apfs-cli`: `inspect`, `volumes`, `ls`, `cat`, `extract`, `verify-read`.

### Acceptance gates

- Fixture image tree and file hashes match macOS-generated manifest.
- Corrupt object tests return typed errors.
- Fuzz targets exist for object headers, B-tree nodes, and checkpoint selection.
- No platform-specific code in core crates.

## Track C — Windows read-only MVP

### Goal

Expose APFS volumes to Windows through a read-only user-mode mount.

### Work packages

1. Evaluate WinFsp integration strategy: direct FFI, generated binding, or shim.
2. Create `apfs-win` adapter mapping WinFsp callbacks to `apfs-vfs`.
3. Implement mount selection by volume name/UUID.
4. Map APFS metadata to conservative Windows attributes.
5. Implement file open/read/readdir/statfs/readlink.
6. Implement read-only refusal for all write-like operations.
7. Add Windows raw-device read-only opener.
8. Add Windows mount smoke test using fixture image.
9. Add installer/packaging plan.

### Acceptance gates

- Mount disk image as read-only drive.
- Copy fixture tree through Explorer and PowerShell.
- Raw external APFS device can be inspected read-only.
- Write attempts fail safely.
- Unsupported features show actionable errors.

## Track D — Advanced read support

### Goal

Support the common APFS features that real-world Mac volumes use.

### Work packages

1. Extended attributes.
2. Resource forks.
3. Finder metadata.
4. Sparse files.
5. Clone/reflink detection.
6. Case-sensitive and case-insensitive lookup.
7. Unicode normalisation policy.
8. ZLIB compression.
9. LZVN compression.
10. LZFSE compression.
11. Snapshot discovery.
12. Snapshot read-only mount/extract.
13. Volume roles and volume groups.
14. DMG/sparsebundle adapter if feasible.

### Acceptance gates

- Each feature has a generated fixture.
- Hashes match macOS manifests.
- Compatibility matrix updated per feature.
- Unsupported compression or metadata variants fail per-file, not by crashing.

## Track E — Software-encryption read support

### Goal

Read software-encrypted APFS volumes when the user supplies valid credentials through documented paths.

### Work packages

1. Encrypted volume state detection.
2. Secure prompt and secret input handling.
3. Keybag parser.
4. Key derivation implementation behind audited dependencies.
5. Encrypted metadata/data extent reads.
6. Zeroisation and redaction.
7. Security review.
8. Fixture generation for supported encrypted cases.

### Acceptance gates

- Valid encrypted fixture reads correctly.
- Invalid secret fails safely.
- Logs and diagnostics are redacted.
- Unsupported internal hardware-bound cases report unsupported status.

## Track F — Image-only write lab

### Goal

Develop write semantics on disposable images only.

### Work packages

1. Write transaction design spec.
2. Disposable APFS image creation.
3. Copy-on-write allocation model.
4. File create/write/truncate/delete.
5. Directory create/delete.
6. Rename.
7. Xattr write.
8. Object map update.
9. Space accounting update.
10. Checkpoint writer.
11. Crash-injection harness.
12. Random operation generator.
13. macOS differential verifier.

### Acceptance gates

- Failure injection after every write step.
- Old or new checkpoint remains valid after interruption.
- macOS can mount and verify images after randomized operations.
- No physical-device write path exists in this milestone.

## Track G — Windows write beta

### Goal

Expose limited, opt-in write support on Windows after the write lab is proven.

### Work packages

1. Windows exclusive lock design.
2. Preflight verifier.
3. Dry-run mutation journal.
4. Opt-in command-line and mount flags.
5. Write operation allow-list.
6. Conservative refusal policy.
7. Image read-write mount beta.
8. External-volume beta only after image write beta evidence.

### Acceptance gates

- Explicit opt-in required.
- Refuse unknown incompatible features.
- Refuse unsupported encryption states, sealed system roles, Fusion, and damaged metadata.
- Crash consistency evidence available from image lab.
- Public beta warning and backup guidance in CLI.

## Track H — Cross-platform adapters

### Goal

Reuse the shared APFS core across Linux, macOS, ChromeOS, and Android.

### Linux plan

- Implement `apfs-fuse` using the selected Rust FUSE crate.
- Support read-only mount first.
- Use Linux CI for build and unit tests; integration mount tests may require privileged/self-hosted runner.

### macOS plan

- Use macOS for fixture generation and differential validation first.
- Consider macFUSE adapter for parity testing.
- Keep native macOS APFS as validation oracle, not as implementation dependency.

### ChromeOS plan

- CLI extraction and inspection first.
- FUSE only in supported Linux/developer environments.

### Android plan

- Library and app integration first.
- Do not assume raw block-device access.
- Root/FUSE mode only as optional later work.

## Track I — Packaging and user experience

### Goal

Make the tool usable and safe for non-expert users.

### Work packages

1. CLI help and structured output.
2. Windows installer strategy.
3. WinFsp runtime dependency handling.
4. Winget manifest.
5. Signed binary release pipeline.
6. Checksums and SBOM.
7. Diagnostic bundle with redaction.
8. Optional GUI/tray helper later.

### Acceptance gates

- User can inspect, mount, and extract with clear commands.
- Installer does not silently enable write support.
- Diagnostics never include secrets.

## Track J — Community, documentation, and support

### Goal

Build a maintainable FOSS project that contributors can safely work on.

### Work packages

1. Contributor guide.
2. Architecture guide.
3. Fixture guide.
4. Safety guide.
5. APFS capability docs.
6. Platform support docs.
7. Bug-report template with redaction guidance.
8. Good first issues.
9. Governance and maintainer policy.

### Acceptance gates

- New contributor can run tests from documented steps.
- Good first issues avoid raw-device and write-lab tasks.
- Security-sensitive issues route through private disclosure.

## Initial issue backlog

| Issue | Track | Title | Acceptance criteria |
|---:|---|---|---|
| 1 | A | Create repository skeleton and Codev context | `codev/`, `crates/`, `.github/`, docs, and templates present. |
| 2 | A | Add clean-room and licence policy | Policy merged; dependency review required. |
| 3 | A | Add compatibility matrix | Matrix covers APFS features and platforms. |
| 4 | B | Implement `apfs-types` object header parsing | Unit tests and fuzz target pass. |
| 5 | B | Implement image block-device backend | Range reads, errors, and cache tested. |
| 6 | B | Parse APFS container superblock | `apfs inspect` shows core metadata. |
| 7 | B | Implement checkpoint selection | Valid checkpoint chosen from fixtures. |
| 8 | B | Implement object map lookup | OID lookups tested against fixtures. |
| 9 | B | Implement B-tree parser | Directory tree fixture can be traversed. |
| 10 | B | Implement volume enumeration | `apfs volumes` returns fixture volumes. |
| 11 | B | Implement directory listing | `apfs ls` matches manifest. |
| 12 | B | Implement regular file extraction | Extracted hashes match manifest. |
| 13 | C | Evaluate WinFsp binding approach | ADR recommends adapter path. |
| 14 | C | Implement Windows read-only image mount | Explorer can copy fixture files. |
| 15 | C | Implement Windows raw-device read-only inspect | External APFS device inspected without writes. |
| 16 | D | Add xattr/resource fork support | Fixture values match manifest. |
| 17 | D | Add compression support | ZLIB/LZVN/LZFSE fixtures pass. |
| 18 | D | Add snapshot listing/read mount | Snapshot fixture can be mounted read-only. |
| 19 | E | Add software-encryption read spec | Security review checklist merged. |
| 20 | F | Add write transaction design | Mutated structures and crash points listed. |
| 21 | F | Build image-only write lab | File operations on disposable images pass. |
| 22 | G | Windows write beta preflight design | Exclusive lock and refusal policy implemented. |
| 23 | H | Linux FUSE read-only adapter | Core reused; Linux mount smoke passes where available. |
| 24 | I | Release pipeline and signed artifacts | Checksums, SBOM, and signed binaries produced. |
| 25 | J | Contributor and fixture docs | New contributor setup verified. |

## Suggested sequencing

1. Tracks A and B begin immediately.
2. Track C starts once directory listing and file read work from images.
3. Track D starts feature-by-feature after MVP extraction works.
4. Track E starts after advanced read infrastructure is stable.
5. Track F starts only after read-only core is robust.
6. Track G starts only after Track F passes crash-injection gates.
7. Track H starts after Windows read-only MVP, except macOS fixture tooling which starts earlier.
8. Tracks I and J run continuously.
