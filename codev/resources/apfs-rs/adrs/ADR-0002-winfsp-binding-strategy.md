# ADR-0002: WinFsp Binding Strategy

Status: Proposed  
Date: 2026-06-23  
Document version: 0.2.0

## Context

Windows is the first APFS-RS product target. The read-only MVP needs a user-mode filesystem bridge that can expose APFS volumes to Explorer and PowerShell without writing a custom Windows kernel filesystem driver.

## Decision

Use WinFsp as the primary Windows bridge for the MVP. Implement a narrow Rust adapter crate, `apfs-win`, that translates WinFsp callbacks into `apfs-vfs` operations.

Prototype options in this order:

1. Direct Rust FFI using `windows` plus generated/bindgen WinFsp bindings.
2. Small C shim if direct FFI is brittle.
3. Dokany only if WinFsp proves unsuitable or a later ADR accepts secondary support.

## Required adapter operations for MVP

- Mount/init.
- Lookup/getattr.
- Open read-only.
- Read.
- Readdir.
- Readlink if representable.
- Statfs.
- Explicit read-only refusal for create/write/truncate/delete/rename/setattr.

## Consequences

- Windows adapter remains isolated.
- APFS core remains platform-neutral.
- Unsafe/FFI review is concentrated in `apfs-win`.
- WinFsp runtime dependency must be documented and packaged.

## Alternatives considered

1. Custom kernel filesystem driver — rejected for MVP due to complexity and risk.
2. Dokany first — deferred as secondary because WinFsp is the preferred first bridge.
3. Extraction-only Windows release — useful fallback, but read-only mount is the higher-value MVP.

## Review date

Revisit after the first WinFsp read-only image mount smoke test.
