# Spec 0001: APFS-RS Project Charter and Scope

Document version: 0.1.0  
Status: Draft  
Date: 2026-06-23  
Codev phase: Specify

## Purpose

Build a FOSS Rust toolchain that can read, write, inspect, verify, and mount Apple File System (APFS) containers and volumes across Windows, Linux, macOS, Android, and ChromeOS, with Windows as the first platform priority.

The project should be structured as a clean-room Rust implementation with a shared APFS core and thin platform adapters. Platform-specific crates must not duplicate APFS logic.

## First public product goal

The first public release should be a Windows-first, read-only release:

- Inspect APFS containers and volumes from disk images and external disks.
- Extract files through a CLI.
- Mount APFS volumes read-only in Windows Explorer through a user-mode filesystem bridge.
- Refuse unsupported, ambiguous, encrypted, or damaged inputs safely.
- Publish an explicit compatibility matrix rather than claiming broad APFS support prematurely.

## Long-term product goal

The long-term product is a cross-platform APFS engine and tool suite that supports:

- APFS container and volume inspection.
- Read-only and read-write mounts.
- File extraction and copying.
- Metadata and extended attribute access.
- Snapshots, clones, sparse files, compression, and volume groups.
- Software-encrypted volumes when the user supplies valid keys.
- Formatting, verification, and repair after the read and write engines are mature.
- Platform adapters for Windows, Linux, macOS, Android, and ChromeOS.

## Platform priority

1. **Windows** — primary MVP target. Use WinFsp first; keep Dokany as a secondary/optional adapter.
2. **Linux** — second platform, using FUSE/libfuse-compatible Rust adapters.
3. **ChromeOS** — extraction CLI and developer-mode FUSE first; broader support depends on ChromeOS mode and device policy.
4. **macOS** — useful for testing and parity validation; lower product priority because native APFS support exists.
5. **Android** — library and app-access mode first; FUSE/root modes are optional and device-dependent.

## Safety posture

APFS write support is a high-risk feature. The default project posture is:

- Read-only by default.
- No physical-disk write support until image-only write testing is proven.
- No write support for unknown feature flags.
- No write support for damaged metadata.
- No write support for sealed system volumes until explicitly specified.
- No write support for Fusion/multi-device APFS until explicitly specified.
- No bypassing access controls.
- No password recovery, password cracking, or key extraction.
- No agent/builder raw-disk write access.

## Clean-room posture

The project should be permissively licensed where possible, with a strong licence-contamination boundary.

Rules:

1. Use public specifications, generated test fixtures, black-box behaviour, and differential testing as primary inputs.
2. Do not copy code from GPL or LGPL APFS projects into the permissive Rust core.
3. Existing APFS projects may be used for comparison and behavioural cross-checking after licence review.
4. Any derived interpretation of APFS structures must be documented in resources or ADRs.
5. Dependencies must pass licence, maintenance, safety, and supply-chain review before adoption.

## Repository architecture target

The eventual implementation repository should use this shape:

```text
apfs-rs/
├── codev/
│   ├── specs/
│   ├── plans/
│   ├── reviews/
│   └── resources/
├── crates/
│   ├── apfs-types/
│   ├── apfs-blockdev/
│   ├── apfs-core/
│   ├── apfs-read/
│   ├── apfs-compress/
│   ├── apfs-crypto/
│   ├── apfs-write/
│   ├── apfs-vfs/
│   ├── apfs-win/
│   ├── apfs-fuse/
│   ├── apfs-android/
│   ├── apfs-cli/
│   └── apfs-test/
├── fuzz/
├── fixtures/
├── tools/
├── docs/
└── .github/
```

## Proposed licences

- Rust core crates: `MIT OR Apache-2.0`.
- CLI: `MIT OR Apache-2.0`.
- Documentation: `CC-BY-4.0` or `Apache-2.0`.
- Platform adapters: same where possible, subject to WinFsp/Dokany/macFUSE/libfuse licence constraints.
- Test fixtures: explicit fixture licence and provenance metadata.

## Explicit non-goals for the Windows read-only MVP

- Write support.
- Repair.
- Formatting.
- Snapshot creation/deletion.
- T2-bound or hardware-bound internal Mac/iOS decryption.
- Password cracking or credential recovery.
- Fusion/multi-device APFS support.
- Kernel-mode Windows filesystem driver.
- Silent best-effort parsing of inconsistent metadata.

## Explicit non-goals until the write lab is proven

- Write support to physical disks.
- Write support for encrypted APFS.
- Write support for snapshots.
- Write support for sealed system volumes.
- Write support when the container has unknown incompatible features.
- Write support without exclusive locking of the target media.

## Initial acceptance definition

The first meaningful engineering milestone is complete when:

1. A simple macOS-generated APFS image can be inspected.
2. APFS volumes can be enumerated.
3. Directories can be listed.
4. Regular files can be read and extracted.
5. File hashes match a macOS-generated manifest.
6. The same image can be mounted read-only on Windows.
7. Files can be copied out through Windows Explorer and PowerShell.
8. Unsupported images fail clearly and safely.
9. The compatibility matrix reflects what was tested.
10. CI runs format, lint, unit, integration, fuzz-smoke, and documentation checks.

## Codev operating model

Every implementation slice should follow SPIR:

- **Spec** files define what and why.
- **Plan** files define task breakdown, test gates, and sequencing.
- **Implementation** happens in PRs with required CI.
- **Review** files capture lessons, defects, design changes, and follow-up specs.

The initial GitHub Issues should be generated from the roadmap track plan and linked back to these documents.
