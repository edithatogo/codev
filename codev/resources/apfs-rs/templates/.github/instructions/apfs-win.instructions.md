# APFS Windows Adapter Instructions

Template version: 0.2.0  
Applies to: `crates/apfs-win/`, Windows packaging, WinFsp/Dokany integration

## Adapter rules

- WinFsp is the primary Windows user-mode filesystem bridge for the MVP.
- Dokany is optional and secondary until an ADR accepts it.
- The adapter translates Windows filesystem calls into `apfs-vfs`; it must not duplicate APFS parsing logic.
- The MVP is read-only. Every write-like callback must fail safely and predictably.
- Raw-device opens must be read-only unless a future accepted write-beta spec permits otherwise.

## Required tests

- Build on `windows-latest`.
- CLI image smoke test.
- WinFsp mount smoke on a self-hosted Windows runner where available.
- Explorer/PowerShell copy test for mounted fixture images.
- Explicit write-operation refusal tests.

## Review trigger

Ask for Windows-maintainer and security-maintainer review when changing FFI, raw-device handling, mount lifecycle, path normalisation, file attributes, or privilege requirements.
