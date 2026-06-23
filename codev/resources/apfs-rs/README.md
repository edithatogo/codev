# APFS-RS Codev Context Pack

Document version: 0.1.0  
Status: Draft planning context  
Date: 2026-06-23  
Codev protocol: SPIR — Specify, Plan, Implement, Review

This directory indexes the Codev planning artifacts for a proposed FOSS Rust implementation of APFS tooling, with a Windows-first priority and a cross-platform end state across Windows, Linux, macOS, Android, and ChromeOS.

The intent is to treat project context as versioned engineering source. These files are not implementation code; they are the top-level context that should drive GitHub Issues, implementation plans, PRs, CI/CD automation, and reviews.

## Document map

### Specifications

- `codev/specs/apfs-rs/0001-project-charter-and-scope.md` — project charter, product intent, platform scope, safety posture, licensing posture, and non-goals.
- `codev/specs/apfs-rs/0002-requirements-moscow.md` — MoSCoW requirements for the Windows-first MVP and later cross-platform/write milestones.
- `codev/specs/apfs-rs/0003-capabilities-matrix.md` — capability-by-capability target coverage, risk, acceptance criteria, and platform implications.

### Design resources

- `codev/resources/apfs-rs/design-and-architecture.md` — Rust workspace architecture, platform adapters, core APFS engine design, safety boundaries, and Mermaid diagrams.
- `codev/resources/apfs-rs/library-and-dependency-strategy.md` — candidate Rust crates, Windows/FUSE bridge libraries, dependency governance, audit gates, and bleeding-edge watchlist.
- `codev/resources/apfs-rs/github-automation-templates.md` — future implementation-repo issue, PR, CODEOWNERS, Dependabot, required-check, and automation templates.
- `codev/resources/apfs-rs/versioning-and-governance.md` — SemVer policy, document versioning, ADR/spec lifecycle, release gates, and governance model.
- `codev/resources/apfs-rs/CHANGELOG.md` — document-set changelog.

### Plans

- `codev/plans/apfs-rs/0001-roadmap-tracks.md` — tracks, milestones, issue backlog, sequencing, and acceptance gates.
- `codev/plans/apfs-rs/0002-engineering-ci-cd-and-quality.md` — GitHub automation, CI/CD, code quality, supply-chain security, fuzzing, differential testing, and agent workflow plan.

### Reviews

- `codev/reviews/apfs-rs/0001-initial-architecture-review.md` — initial review of assumptions, risks, unresolved questions, and recommended first implementation slice.

## Primary product strategy

The project should start as a clean-room Rust workspace named `apfs-rs`, with the first valuable public release being:

> Windows read-only APFS inspection, extraction, and mount support for APFS disk images and external APFS volumes.

Write support should not be exposed for physical disks until a disposable-image write lab, crash-injection harness, macOS differential verifier, and corpus-based regression suite prove the transaction model.

## Codev usage

Each major capability should be driven through SPIR:

1. **Specify** — capture capability, assumptions, non-goals, safety constraints, and acceptance tests.
2. **Plan** — break the spec into executable tasks and verification gates.
3. **Implement** — implement in isolated branches/worktrees with tests and CI.
4. **Review** — record lessons learned, update capability matrix, and feed discoveries back into specs/resources.

Builder agents must never receive raw-disk write access. Agent work should use fixture images, sparse files, generated corpora, and sandboxed CI runners only.

## Source references to monitor

This context pack intentionally avoids copying implementation code from existing APFS tools. It should rely on documented formats, generated fixtures, differential testing, and clean-room behavioural observations. Reference projects and libraries should be used for comparison, not code import, unless licence review explicitly permits it.

Initial upstream references to monitor:

- Apple APFS reference: https://developer.apple.com/support/downloads/Apple-File-System-Reference.pdf
- WinFsp: https://github.com/winfsp/winfsp
- Dokany: https://github.com/dokan-dev/dokany
- libfuse: https://github.com/libfuse/libfuse
- macFUSE: https://github.com/macfuse/macfuse
- libfsapfs: https://github.com/libyal/libfsapfs
- apfs-fuse: https://github.com/sgan81/apfs-fuse

## Document version

The initial context pack is version `0.1.0`. Update `CHANGELOG.md` and `versioning-and-governance.md` whenever the planning context changes materially.
