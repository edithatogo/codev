# APFS-RS High-Assurance Rust Quality Plan

Document version: 0.2.0  
Status: Draft  
Date: 2026-06-23

## Purpose

APFS-RS parses untrusted filesystem data and may eventually write filesystem metadata. Ordinary unit tests are not sufficient. This file defines the high-assurance Rust quality tiers for parser, compression, crypto, FFI, and write-lab code.

## Quality tiers

| Tier | Trigger | Tools | Scope |
|---|---|---|---|
| PR required | Every PR | fmt, clippy, nextest, deny, audit | Baseline quality. |
| PR targeted | Parser/unsafe/crypto/write paths | fuzz-smoke, fixture checks, redaction tests | Risk-specific evidence. |
| Nightly | Schedule | long fuzz, cargo-mutants, coverage | Deeper bug discovery. |
| Pre-release | Release branch/tag | full fixture matrix, CodeQL, SBOM, provenance | Release confidence. |
| Write-gate | Write lab/beta | crash injection, random operations, macOS differential | Data-loss prevention. |

## Tool roles

| Tool | Role |
|---|---|
| `cargo-nextest` | Fast Rust test execution with CI-friendly output. |
| `cargo-fuzz` | Coverage-guided fuzzing for metadata parsers and keybags. |
| `cargo-llvm-cov` | Source-based coverage reporting. |
| `cargo-mutants` | Mutation testing to find weak tests. |
| Miri | Undefined-behaviour detection for Rust tests and unsafe-adjacent code. |
| Kani | Targeted model checking for arithmetic and invariants. |
| cargo-careful | Extra debug checking with nightly std where useful. |
| CodeQL | Static security analysis, including Rust support. |

## High-value Kani targets

Use Kani selectively for small, pure, high-risk logic:

- Block range arithmetic.
- Object header size validation.
- Checksum precondition logic.
- Extent coalescing.
- B-tree bounds calculations.
- Path traversal normalisation guards.
- Transaction plan invariants.

## Fuzz targets

Minimum targets:

- Object header parser.
- Checkpoint selector.
- B-tree node parser.
- Object-map lookup payload parser.
- Directory record parser.
- Extent parser.
- Compression dispatch.
- Keybag parser.
- Diagnostic bundle redactor.

## Mutation testing policy

Run mutation testing:

- On parser crates before advanced read release.
- On `apfs-write` before write lab release.
- On path/extraction safety code before MVP beta.

Do not require 100% mutant kill rate, but every surviving mutant in safety-critical code must be reviewed.

## Coverage policy

Coverage is a signal, not a proof. Release gates should require:

- Coverage report generated.
- Coverage trend not materially worse without explanation.
- Critical parser modules have targeted tests.
- Safety refusal branches are tested.

## Agent guidance

When agents touch high-risk code, they should add the highest-value narrow tests first. Agents should not reduce lints, skip fuzz targets, or mark mutants ignored without maintainer review.
