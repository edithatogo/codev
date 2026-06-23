# Spec 0002: Requirements with MoSCoW Prioritisation

Document version: 0.1.0  
Status: Draft  
Date: 2026-06-23  
Codev phase: Specify

## Scope

This requirements file covers the complete product vision, but prioritises the Windows read-only MVP. MoSCoW terms mean:

- **Must** — required for the named milestone to be considered complete.
- **Should** — important, expected soon after the milestone, but not blocking the first release.
- **Could** — useful enhancement when safe and practical.
- **Won't yet** — deliberately excluded from the current milestone or excluded until a later safety gate.

## MVP: Windows read-only APFS inspection, extraction, and mount

### Must have

| ID | Requirement | Acceptance criteria |
|---|---|---|
| M-001 | Parse APFS containers from disk image files | `apfs inspect disk.img` identifies APFS container metadata, block size, checkpoint candidates, and feature flags. |
| M-002 | Parse APFS containers from Windows block devices in read-only mode | `apfs inspect \\.\PhysicalDriveN` opens read-only, never writes, and fails if exclusive/read permissions are insufficient. |
| M-003 | Validate object headers and checksums where applicable | Corrupt objects are detected and reported as hard failures unless explicitly ignored in forensic mode. |
| M-004 | Select a valid checkpoint | The tool identifies the newest internally consistent checkpoint and reports fallback decisions. |
| M-005 | Resolve object-map entries | Known object IDs can be resolved to physical block addresses in the selected checkpoint. |
| M-006 | Traverse APFS B-trees | Directory and file metadata trees can be walked with bounds checks and cycle protection. |
| M-007 | Enumerate volumes | `apfs volumes` lists volume name, UUID, role where available, encryption state, feature flags, and safety status. |
| M-008 | List directories | `apfs ls image:/Volume/path` returns deterministic entries with type, size, and timestamps where available. |
| M-009 | Read regular files | `apfs cat` and `apfs extract` return byte-identical content for non-compressed, unencrypted regular files in simple fixtures. |
| M-010 | Handle symlinks and basic hard links read-only | Symlinks are exposed as links where the platform supports them or as metadata through CLI output. |
| M-011 | Provide Windows read-only mount | A selected APFS volume can be mounted read-only through WinFsp and browsed in Explorer. |
| M-012 | Preserve basic metadata | Created/modified/accessed timestamps and file sizes are exposed where representable. |
| M-013 | Safe failure on unsupported features | Unsupported compression, encryption, snapshots, Fusion, damaged metadata, or incompatible flags produce clear errors. |
| M-014 | CLI diagnostics | `inspect`, `volumes`, `ls`, `cat`, `extract`, `mount`, `verify-read`, and `dump-tree` exist with structured JSON output options. |
| M-015 | Test corpus | At least one macOS-generated APFS image per MVP scenario exists with a manifest of tree entries and hashes. |
| M-016 | CI quality gates | Formatting, clippy, tests, deny/audit, docs, and fuzz-smoke run in GitHub Actions. |
| M-017 | Security posture | No secrets in logs; no raw writes; no password recovery; unsafe code requires documented safety invariants. |
| M-018 | Compatibility matrix | Public matrix states exactly what scenarios are supported, tested, experimental, or unsupported. |
| M-019 | Clean-room implementation | No copied GPL/LGPL implementation code in permissive core crates. |
| M-020 | Codev traceability | Each implementation slice links issue → spec → plan → PR → review. |

### Should have

| ID | Requirement | Acceptance criteria |
|---|---|---|
| S-001 | Windows image and raw-device caching | Sequential extraction and Explorer copy avoid repeated metadata reads through a bounded range/object cache. |
| S-002 | PowerShell-friendly output | Commands support `--json` and stable exit codes. |
| S-003 | Case-sensitive and case-insensitive lookup modes | Volume mode is detected and path matching behaves as expected. |
| S-004 | Basic xattr read visibility | Extended attributes are listed, even if not fully projected into Windows Explorer. |
| S-005 | Resource fork extraction | Resource forks can be extracted through explicit CLI options. |
| S-006 | ZLIB-compressed file read | ZLIB/APFS decmpfs cases in the corpus read correctly. |
| S-007 | Crash-only read model | Any panic is treated as a bug; corrupt inputs return typed errors. |
| S-008 | Windows installer plan | MSI/winget packaging plan exists, with WinFsp dependency handling. |
| S-009 | Contributor guide | Development setup, fixture handling, and safety constraints are documented. |
| S-010 | Docs website or generated mdbook | User and developer documentation can be published from versioned markdown. |

### Could have

| ID | Requirement | Acceptance criteria |
|---|---|---|
| C-001 | GUI explorer helper | Optional tray/GUI helper for selecting volumes and mount letters. |
| C-002 | Forensic mode | Optional mode can continue after selected metadata errors while marking output as untrusted. |
| C-003 | DMG adapter | Read APFS inside supported DMG/sparsebundle containers without external conversion. |
| C-004 | Preview Linux FUSE mount | Linux read-only FUSE adapter behind experimental feature flag. |
| C-005 | Telemetry-free diagnostics bundle | User can export redacted metadata for bug reports. |

### Won't have in MVP

| ID | Exclusion | Reason |
|---|---|---|
| W-001 | Write support | Too high risk before transaction lab and crash-injection tests. |
| W-002 | Physical-disk write support | Requires proven image-write safety and exclusive-lock design. |
| W-003 | Encrypted volume unlock | Defer until software-encryption spec and key-handling review. |
| W-004 | T2/iOS hardware-bound decryption | Not a valid MVP target and may require undocumented hardware/kernel paths. |
| W-005 | Fusion/multi-device support | Requires dedicated allocation and failure-mode design. |
| W-006 | Repair and format | Require mature read/write object model and safety proofs. |
| W-007 | Kernel-mode Windows filesystem driver | User-mode bridge is safer and faster to ship. |

## Advanced read milestone

### Must have

- Extended attributes and resource forks.
- Sparse files.
- Clone/reflink detection.
- ZLIB, LZVN, and LZFSE decompression where APFS uses decmpfs-style storage.
- Snapshot listing.
- Mount a specific snapshot read-only.
- Volume groups and APFS roles exposed in diagnostics.
- Compatibility matrix updated with each feature.

### Should have

- DMG/sparsebundle adapter.
- More complete permission and ACL mapping.
- Performance profiling and cache tuning on large disks.
- Corpus generated across multiple macOS releases.

### Won't have yet

- Snapshot creation or deletion.
- Sealed system volume write support.
- Any physical-disk write support.

## Software-encryption read milestone

### Must have

- Detect encrypted software APFS volumes.
- Prompt for passphrase without logging it.
- Support documented password/recovery-key paths where feasible.
- Zeroize sensitive key material.
- Prevent keys from appearing in crash reports, logs, or diagnostic bundles.
- Refuse unsupported hardware-bound encryption clearly.

### Should have

- Security review focused on key handling.
- OS-specific secure memory where practical.
- Red-team tests for accidental key logging.

### Won't have

- Password cracking.
- Circumvention of access controls.
- T2/iOS hardware-bound unlock unless safe, documented, and lawful interfaces exist.

## Image-only write lab milestone

### Must have

- Create disposable APFS images.
- File create, write, truncate, delete.
- Directory create/delete.
- Rename.
- Basic metadata updates.
- Copy-on-write transaction builder.
- Object-map updates.
- Space accounting.
- Checkpoint writer.
- Failure injection after every planned write step.
- macOS differential validation on disposable images.

### Should have

- Randomized operation generator.
- Coverage-guided fuzzing for transaction plans.
- Tree-diff verifier against macOS and apfs-rs.

### Won't have

- Raw physical-disk writes.
- Encrypted write support.
- Snapshot mutation.
- Repair.

## Windows write beta milestone

### Must have

- Explicit opt-in flag.
- Exclusive lock on target volume/device.
- Preflight verifier.
- Backup recommendation and dry-run plan.
- Refuse unknown incompatible features.
- Refuse encrypted, Fusion, sealed, or damaged volumes unless specifically supported later.
- Journal of intended object mutations for diagnostics.
- Crash consistency evidence from image lab.

### Should have

- Gradual feature flags per write operation.
- Beta telemetry-free diagnostic export.
- Signed Windows binaries and installer.

### Won't have initially

- Write support for all APFS variants.
- Repair of arbitrary corrupted containers.
- Write support while also mounted by macOS or another OS.

## Cross-platform milestones

### Linux

- Must reuse `apfs-core` and `apfs-vfs`.
- Must use a FUSE-compatible adapter.
- Should run on mainstream distributions with packaged libfuse.

### macOS

- Must reuse the same core.
- Should focus on testing, fixtures, and compatibility validation first.
- Could expose macFUSE mount for parity testing.

### ChromeOS

- Must support CLI extraction where allowed.
- Should support FUSE only in compatible developer/Linux environments.

### Android

- Must start as a library and app-facing access layer.
- Should not assume root/block-device access.
- Could provide rooted-device FUSE mode later.

## Non-functional requirements

| Area | Requirement |
|---|---|
| Safety | No silent data mutation; read-only default; strict unsupported-state refusal. |
| Reliability | Typed errors instead of panics; fixture regression suite; crash-consistency tests for writes. |
| Security | Supply-chain scanning; key hygiene; no secret logs; sandboxed agents. |
| Performance | Bounded cache; streaming extraction; no unbounded memory use for corrupt metadata. |
| Portability | Core crates must be platform-neutral; adapters isolate OS-specific code. |
| Observability | Structured tracing, redacted diagnostics, reproducible bug reports. |
| Maintainability | Modular crates; Codev SPIR traceability; ADRs for major choices. |
| Compliance | Licence review for all dependencies and reference implementations. |
