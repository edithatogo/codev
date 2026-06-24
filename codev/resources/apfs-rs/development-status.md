# APFS-RS Development Status

Document version: 0.4.0  
Status: Current status note  
Date: 2026-06-24

## Current truth

APFS-RS has not yet begun production APFS filesystem implementation. The work completed so far is:

1. A Codev planning/context pack.
2. A Windows-first APFS product and safety plan.
3. Machine-readable registries for capabilities, fixtures, safety gates, and dependency policy.
4. Agent instruction templates and GitHub automation templates.
5. An executable implementation-repository scaffold design.
6. Local starter repository scaffold packaged for download.

No APFS parser, Windows mount adapter, encryption support, compression support, write transaction engine, or repair/format code should be claimed as implemented yet.

## Development that can start immediately

The first development milestone should be a small, safe Rust scaffold:

- Cargo workspace.
- Safe core crates with `#![forbid(unsafe_code)]`.
- `apfs-cli inspect --json <source>` command skeleton.
- Read-only image block-device abstraction.
- APFS superblock probe scaffold.
- `xtask registry-check` and `xtask safety-check` scaffold.
- CI templates for Rust checks and policy checks.

This is scaffolding and developer infrastructure, not functional APFS support.

## Definition of “started developing”

Development begins when a dedicated implementation repository contains buildable Rust code and CI. Functional APFS development begins when the first APFS fixture and `apfs inspect --json` can parse real APFS container metadata from a synthetic image.

## First functional milestone

Capability: `M-001` plus partial `M-003`.

Outcome:

```bash
apfs inspect fixtures/simple-unencrypted-case-sensitive-001.apfs --json
```

Acceptance:

- Opens an APFS disk image read-only.
- Identifies APFS container magic and basic block/container fields.
- Refuses truncated input with typed errors.
- Produces stable JSON output.
- Does not mount, extract, decrypt, compress, or write anything.

## Communication rule

Until functional APFS parsing lands, all project artifacts should describe the state as “planning and scaffold” rather than “APFS implementation.”
