# ADR-0001: APFS Parser Strategy

Status: Proposed  
Date: 2026-06-23  
Document version: 0.2.0

## Context

APFS-RS must parse untrusted on-disk metadata safely. APFS structs are binary, endian-sensitive, versioned, and often nested through object maps and B-trees. Parser mistakes can cause incorrect reads, crashes, or future write corruption.

## Decision

Start with explicit, safe, endian-aware parsing for APFS metadata. Use typed newtypes for object IDs, transaction IDs, block numbers, offsets, and feature flags.

Default approach:

- Safe byte-slice parsing.
- Explicit bounds checks.
- Explicit endianness.
- Typed errors.
- No unchecked `transmute` of on-disk data.
- Validate headers/checksums before payload interpretation.
- Fuzz every high-risk parser.

Evaluate `zerocopy`, `bytemuck`, `winnow`, or `binrw` only through a dependency ADR/review and only where they reduce risk.

## Consequences

- Parser code may be more verbose.
- Safety and auditability improve.
- Agents get a simple rule: no clever zero-copy parsing unless accepted by ADR.

## Alternatives considered

1. Direct struct overlay with unsafe casts — rejected initially due to alignment and trust risks.
2. Parser-combinator-first approach — deferred until complexity justifies it.
3. Generated parser from APFS structs — deferred; source of truth and validation burden unclear.

## Review date

Revisit after `apfs inspect`, `volumes`, `ls`, and `extract` work against the MVP fixture set.
