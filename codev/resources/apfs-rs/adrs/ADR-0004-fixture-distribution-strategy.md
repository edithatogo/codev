# ADR-0004: Fixture Distribution Strategy

Status: Proposed  
Date: 2026-06-23  
Document version: 0.2.0

## Context

APFS-RS needs APFS images for parser, read, compression, snapshot, encryption, and write-lab tests. Real disk images may contain personal data and may be large. Some APFS feature cases need macOS to generate reliable oracle output.

## Decision

Use a manifest-first fixture strategy.

- Commit generation scripts.
- Commit manifests, expected hashes, and redacted oracle logs.
- Commit only small, synthetic images after review.
- Generate large or sensitive images in controlled CI or locally.
- Never commit personal data.
- Never commit real secrets for encrypted fixtures.
- Use disposable generated images for write-lab tests.

## Consequences

- CI can run small fixture tests everywhere.
- Larger coverage may require scheduled or self-hosted runners.
- Compatibility claims remain evidence-backed without bloating Git.
- Agents cannot invent fixture data; they must update registry and scripts.

## Alternatives considered

1. Commit all fixture images — rejected due to size and privacy risk.
2. Require contributors to bring their own APFS disks — rejected due to reproducibility and safety risk.
3. Use only mocked metadata — rejected because APFS compatibility must be tested against real APFS images.

## Review date

Revisit after the first MVP fixture set is generated.
