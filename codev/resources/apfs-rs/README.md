# APFS-RS Codev Context Pack

Document version: 0.2.0  
Status: Draft planning and agentability context  
Date: 2026-06-23  
Codev protocol: SPIR — Specify, Plan, Implement, Review

This directory indexes the Codev planning artifacts for a proposed FOSS Rust implementation of APFS tooling, with a Windows-first priority and a cross-platform end state across Windows, Linux, macOS, Android, and ChromeOS.

The intent is to treat project context as versioned engineering source. These files are not implementation code; they are the top-level context that should drive GitHub Issues, implementation plans, PRs, CI/CD automation, coding-agent behaviour, and reviews.

## Document map

### Specifications

- `codev/specs/apfs-rs/0001-project-charter-and-scope.md` — project charter, product intent, platform scope, safety posture, licensing posture, and non-goals.
- `codev/specs/apfs-rs/0002-requirements-moscow.md` — MoSCoW requirements for the Windows-first MVP and later cross-platform/write milestones.
- `codev/specs/apfs-rs/0003-capabilities-matrix.md` — capability-by-capability target coverage, risk, acceptance criteria, and platform implications.
- `codev/specs/apfs-rs/0004-fixture-and-differential-testing.md` — fixture generation, manifests, macOS differential oracle, and evidence gates.
- `codev/specs/apfs-rs/0005-cli-and-user-experience.md` — CLI commands, JSON output, compatibility reports, diagnostics, and user safety UX.
- `codev/specs/apfs-rs/0006-agent-operating-model.md` — coding-agent task packets, context hierarchy, guardrails, future MCP, and skills model.

### Plans

- `codev/plans/apfs-rs/0001-roadmap-tracks.md` — tracks, milestones, issue backlog, sequencing, and acceptance gates.
- `codev/plans/apfs-rs/0002-engineering-ci-cd-and-quality.md` — GitHub automation, CI/CD, code quality, supply-chain security, fuzzing, differential testing, and agent workflow plan.

### Design and engineering resources

- `codev/resources/apfs-rs/design-and-architecture.md` — Rust workspace architecture, platform adapters, core APFS engine design, safety boundaries, and Mermaid diagrams.
- `codev/resources/apfs-rs/library-and-dependency-strategy.md` — candidate Rust crates, Windows/FUSE bridge libraries, dependency governance, audit gates, and bleeding-edge watchlist.
- `codev/resources/apfs-rs/developer-command-surface.md` — `just`/`xtask` command facade for humans, agents, and CI parity.
- `codev/resources/apfs-rs/high-assurance-rust-quality.md` — nextest, fuzzing, coverage, mutation testing, Miri, Kani, CodeQL, and release quality tiers.
- `codev/resources/apfs-rs/unsafe-code-policy.md` — unsafe-code boundaries, review block, Miri expectations, and forbidden unsafe patterns.

### Machine-readable registries

- `codev/resources/apfs-rs/capabilities.yaml` — capability IDs mapped to milestones, crates, tests, safety gates, and forbidden changes.
- `codev/resources/apfs-rs/fixtures.yaml` — fixture IDs, APFS feature coverage, manifests, oracle outputs, and commit policy.
- `codev/resources/apfs-rs/safety-gates.yaml` — safety gates for read-only default, raw-device access, write lab, secrets, dependencies, and unsafe code.
- `codev/resources/apfs-rs/dependency-policy.yaml` — licence policy, dependency review rules, candidate crates/tools, and required supply-chain checks.

### GitHub, release, and agent resources

- `codev/resources/apfs-rs/github-automation-templates.md` — future implementation-repo issue, PR, CODEOWNERS, Dependabot, required-check, and automation templates.
- `codev/resources/apfs-rs/github-rulesets.md` — intended branch/tag rulesets, required checks, protected paths, and least-privilege workflow policy.
- `codev/resources/apfs-rs/release-engineering.md` — release artifacts, SBOM, provenance, signing, cargo-dist/release-plz evaluation, and release gates.
- `codev/resources/apfs-rs/safety-refusal-matrix.md` — default allow/refuse behaviour for unsupported, damaged, encrypted, Fusion, and write states.
- `codev/resources/apfs-rs/windows-test-lab.md` — GitHub-hosted, self-hosted, and manual Windows test tiers.
- `codev/resources/apfs-rs/mcp-agent-interface.md` — future read-only MCP interface for agent access to project context.
- `codev/resources/apfs-rs/agent-skills.md` — future task-specific agent skill pack.
- `codev/resources/apfs-rs/versioning-and-governance.md` — SemVer policy, document versioning, ADR/spec lifecycle, release gates, and governance model.
- `codev/resources/apfs-rs/CHANGELOG.md` — document-set changelog.

### Implementation-repo templates

- `codev/resources/apfs-rs/templates/AGENTS.md` — root agent instructions template for the future APFS-RS implementation repo.
- `codev/resources/apfs-rs/templates/CLAUDE.md` — companion agent instructions template.
- `codev/resources/apfs-rs/templates/.github/copilot-instructions.md` — GitHub Copilot instruction template.
- `codev/resources/apfs-rs/templates/.github/instructions/apfs-core.instructions.md` — path-specific core/parser instructions.
- `codev/resources/apfs-rs/templates/.github/instructions/apfs-win.instructions.md` — path-specific Windows adapter instructions.
- `codev/resources/apfs-rs/templates/.github/instructions/apfs-write-safety.instructions.md` — path-specific write-safety instructions.
- `codev/resources/apfs-rs/templates/.github/instructions/apfs-security.instructions.md` — path-specific security instructions.

### ADRs

- `codev/resources/apfs-rs/adrs/ADR-0001-parser-strategy.md` — proposed APFS parser strategy.
- `codev/resources/apfs-rs/adrs/ADR-0002-winfsp-binding-strategy.md` — proposed WinFsp binding strategy.
- `codev/resources/apfs-rs/adrs/ADR-0003-agent-instructions-strategy.md` — proposed agent-instruction strategy.
- `codev/resources/apfs-rs/adrs/ADR-0004-fixture-distribution-strategy.md` — proposed fixture distribution strategy.

### Reviews

- `codev/reviews/apfs-rs/0001-initial-architecture-review.md` — initial review of assumptions, risks, unresolved questions, and recommended first implementation slice.

## Primary product strategy

The project should start as a clean-room Rust workspace named `apfs-rs`, with the first valuable public release being:

> Windows read-only APFS inspection, extraction, and mount support for APFS disk images and external APFS volumes.

Write support should not be exposed for physical disks until a disposable-image write lab, crash-injection harness, macOS differential verifier, and corpus-based regression suite prove the transaction model.

## Agentability strategy

The 0.2.0 context pack adds an agentability layer:

1. Agent instruction templates for future implementation repos.
2. Machine-readable capability, fixture, safety, and dependency registries.
3. Task-packet workflow for GitHub Issues.
4. Safety-refusal and unsafe-code policies.
5. Future read-only MCP context interface.
6. Stable developer command facade plan.

This makes the project easier for coding agents to navigate without relying on long, unstructured markdown context alone.

## Codev usage

Each major capability should be driven through SPIR:

1. **Specify** — capture capability, assumptions, non-goals, safety constraints, and acceptance tests.
2. **Plan** — break the spec into executable tasks and verification gates.
3. **Implement** — implement in isolated branches/worktrees with tests and CI.
4. **Review** — record lessons learned, update capability matrix, registries, and feed discoveries back into specs/resources.

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
- AGENTS.md: https://agents.md/
- Model Context Protocol: https://modelcontextprotocol.io/

## Document version

The current context pack is version `0.2.0`. Update `CHANGELOG.md` and `versioning-and-governance.md` whenever the planning context changes materially.
