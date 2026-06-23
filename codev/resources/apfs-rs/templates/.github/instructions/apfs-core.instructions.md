# APFS Core Instructions

Template version: 0.2.0  
Applies to: `crates/apfs-types/`, `crates/apfs-blockdev/`, `crates/apfs-core/`, `crates/apfs-read/`

## Core rules

- Core crates must be platform-neutral.
- Prefer `#![forbid(unsafe_code)]`.
- Parse APFS structures with explicit endianness and bounds checks.
- Validate object type, subtype, size, and checksum before interpreting payloads.
- Use typed errors for corrupt or unsupported input.
- Do not add Windows, FUSE, Android, or macOS dependencies to core crates.

## Required tests for parser changes

- Unit test for valid fixture data.
- Unit test for truncated/corrupt input.
- Fuzz-smoke target or update to an existing target.
- Capability and fixture manifest update when behaviour changes.

## Review trigger

Ask for core-maintainer review when changing checkpoint selection, object map lookup, B-tree traversal, extent interpretation, compression dispatch, or path resolution.
