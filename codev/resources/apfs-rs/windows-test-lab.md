# APFS-RS Windows Test Lab

Document version: 0.2.0  
Status: Draft  
Date: 2026-06-23

## Purpose

Windows is the first platform priority. This file defines the Windows test strategy for build, CLI, mount, raw-device read-only, installer, and future write-beta validation.

## Test tiers

| Tier | Environment | Purpose | Write access |
|---|---|---|---|
| GitHub-hosted Windows | `windows-latest` | Build, unit tests, CLI image tests | None |
| Self-hosted Windows VM | Controlled VM with WinFsp | Read-only mount smoke, Explorer/PowerShell copy | Image only, read-only initially |
| Manual Windows hardware lab | Maintainer-controlled machine | External APFS disk read-only tests, USB detach/retry, permission failure | Read-only until beta approval |
| Future write-beta lab | Isolated Windows VM with disposable media | Restricted beta tests after write-lab evidence | Explicit opt-in only |

## GitHub-hosted Windows checks

Required early:

```text
cargo fmt --all -- --check
cargo clippy --workspace --all-targets --all-features -- -D warnings
cargo nextest run --workspace --all-features
apfs inspect fixtures/simple.img
apfs verify-read fixtures/simple.img --manifest fixtures/simple/manifest.json
```

Limitations:

- Do not assume WinFsp is installed.
- Do not require privileged mount access.
- Do not test raw physical disks.

## Self-hosted Windows VM checks

Required for Windows read-only mount beta:

- WinFsp installed and version reported.
- APFS fixture image mounted read-only.
- Explorer copy succeeds.
- PowerShell `Copy-Item` succeeds.
- Copied file hashes match fixture manifest.
- Write attempts fail with read-only error.
- Mount/unmount repeat loop succeeds.
- Process crash during read-only mount does not alter source image.

## External APFS disk read-only checks

Manual/hardware lab only until stable automation exists:

- Inspect external APFS disk read-only.
- Enumerate volumes.
- Mount selected volume read-only.
- Copy synthetic test tree from external drive.
- Unplug/replug handling documented.
- Permission failure path documented.
- No write handles observed.

## Windows path and metadata cases

Required fixtures/tests:

- Long paths.
- Unicode names.
- Case-sensitive APFS volume.
- Case-insensitive APFS volume.
- Windows-reserved names represented safely.
- Symlink/readlink behaviour.
- Read-only attributes.
- Timestamp conversion.
- Sparse file representation.

## WinFsp adapter smoke test sketch

```powershell
apfs mount .\fixtures\simple.apfs X: --readonly --volume Data
Get-ChildItem X:\ -Recurse | Out-File .\observed-tree.txt
Copy-Item X:\fixture-root .\copied -Recurse
apfs verify-read .\fixtures\simple.apfs --manifest .\fixtures\simple\manifest.json
apfs unmount X:
```

## Future write-beta gates

Before physical/external writes on Windows:

1. Image-only write lab evidence exists.
2. Exclusive lock tests pass.
3. Preflight verifier passes.
4. Dry-run mutation journal is available.
5. Safety refusal matrix is enforced.
6. Beta warning is visible.
7. Write target is synthetic/disposable or user-confirmed with backup guidance.

## Security notes

- Avoid running self-hosted Windows runner with unnecessary privileges.
- Do not store secrets or real disk images on shared runners.
- Use synthetic APFS media.
- Keep WinFsp/Dokany versions pinned or explicitly reported.
