# APFS Security Instructions

Template version: 0.2.0  
Applies to: crypto, secrets, supply-chain, diagnostics, unsafe code, fuzzing

## Security defaults

- No password recovery, password cracking, or access-control bypass.
- No secret material in logs, traces, panic messages, diagnostics, or fixture manifests.
- Software-encryption support requires a dedicated accepted spec and key-handling review.
- Hardware-bound internal-device encryption remains unsupported unless a safe documented interface is accepted later.

## Dependency rules

- New production dependencies require dependency-policy review.
- New crypto dependencies require security-maintainer approval.
- New FFI dependencies require unsafe-code and platform review.
- GPL/LGPL APFS implementation code must not be copied into permissive core crates.

## Required tests

- Secret redaction tests for diagnostics.
- Fuzz targets for keybag and parser changes.
- `cargo audit`, `cargo deny`, and `cargo vet` where configured.
- Miri for unsafe-adjacent code where practical.

## Review trigger

Security-maintainer review is mandatory for crypto, key handling, redaction, unsafe code, dependency policy, fuzz target changes, release signing, SBOM, provenance, or vulnerability-handling changes.
