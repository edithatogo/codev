# APFS-RS Release Engineering

Document version: 0.2.0  
Status: Draft  
Date: 2026-06-23

## Purpose

APFS-RS binaries will interact with user storage, so release integrity and provenance are part of the safety model. This file defines the release pipeline, artifacts, signing/provenance, and release gates.

## Release artifacts

| Artifact | Milestone | Notes |
|---|---|---|
| Windows portable ZIP | MVP beta | CLI and read-only mount binary. |
| Windows installer | MVP stable | MSI or equivalent, with WinFsp dependency handling. |
| SBOM | First public binary | CycloneDX or SPDX. |
| SHA-256 checksums | Every binary release | Published with release. |
| Artifact attestation | First public binary | GitHub artifact attestation where available. |
| SLSA provenance | First stable binary | Use SLSA generator where practical. |
| Winget manifest | MVP stable | Separate review before submission. |
| Linux/macOS binaries | Later | After Windows MVP. |
| crates.io packages | When public API stabilises | Prefer trusted publishing if adopted. |

## Candidate tooling

| Tool | Role | Status |
|---|---|---|
| `dist` / `cargo-dist` | Build and package shippable Rust application binaries | Evaluate before first binary release. |
| `release-plz` | Release PRs, changelog, tags, crates.io publishing | Evaluate once crate boundaries stabilise. |
| `cargo-semver-checks` | Public API compatibility checks | Required before public crate releases. |
| GitHub artifact attestations | Build provenance | Required for public binaries where available. |
| SLSA GitHub generator | SLSA provenance | Target for stable releases. |
| CycloneDX/SPDX SBOM tooling | SBOM | Required for public binaries. |
| Code signing | Windows trust | Required before broad Windows stable release. |

## Release gates

### Alpha

- CI green.
- Changelog updated.
- Compatibility matrix updated.
- Known unsupported cases listed.
- No write support except lab binary if explicitly named.

### Beta

- Windows read-only smoke evidence.
- Fixture manifests pass.
- Fuzz-smoke pass.
- Dependency/security checks pass.
- Redacted diagnostics tested.
- Release artifacts have checksums.

### Stable read-only

- Windows image and external-disk read-only evidence.
- Documentation covers install, inspect, extract, mount, unmount, and refusal states.
- SBOM generated.
- Artifact provenance/attestation generated where available.
- Security policy published.
- Compatibility report snapshot included.

### Write lab

- Lab binary or feature gate clearly labelled.
- Disposable-image-only enforcement.
- Crash-injection evidence bundle attached.
- Not distributed as general write support.

### Windows write beta

- Accepted beta spec and plan.
- Image write lab evidence.
- Exclusive lock tests.
- Dry-run mutation journal.
- Safety-refusal matrix tests.
- Prominent backup and experimental warnings.

## Release notes template

```markdown
# APFS-RS vX.Y.Z

## Channel

alpha | beta | stable | lab

## Supported in this release

## Experimental in this release

## Unsupported/refused cases

## Safety notes

## Compatibility evidence

## Checksums and provenance

## Upgrade notes
```

## Versioning interaction

- Planning context versions may move independently from implementation releases.
- Public crate releases follow SemVer.
- CLI JSON schema includes its own schema version.
- Compatibility matrix snapshots are tied to release tags.
