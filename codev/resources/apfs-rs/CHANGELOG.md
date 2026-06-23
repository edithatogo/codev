# APFS-RS Context Pack Changelog

All notable planning-context changes for the APFS-RS Codev pack are recorded here.

Document set version: 0.2.0  
Date: 2026-06-23

## [0.2.0] - 2026-06-23

### Added

- Added agent instruction templates for future implementation repository: `AGENTS.md`, `CLAUDE.md`, GitHub Copilot instructions, and path-specific GitHub instruction files.
- Added machine-readable registries: `capabilities.yaml`, `fixtures.yaml`, `safety-gates.yaml`, and `dependency-policy.yaml`.
- Added fixture and differential-testing spec.
- Added CLI and user-experience spec, including `compatibility-report`, `explain`, dry-run mount, and redacted diagnostics.
- Added agent operating model spec with task packets, agent task classes, guardrails, future MCP, and skill model.
- Added unsafe-code policy.
- Added safety refusal matrix.
- Added Windows test lab plan.
- Added release engineering plan covering SBOM, provenance, artifact attestations, signing, and release gates.
- Added GitHub rulesets plan.
- Added future read-only MCP agent interface plan.
- Added agent skills plan.
- Added developer command surface plan for `just`/`xtask` command facades.
- Added high-assurance Rust quality plan covering nextest, fuzzing, coverage, mutation testing, Miri, Kani, cargo-careful, and CodeQL.
- Added ADR-0001 parser strategy.
- Added ADR-0002 WinFsp binding strategy.
- Added ADR-0003 agent instructions strategy.
- Added ADR-0004 fixture distribution strategy.

### Changed

- Updated APFS-RS context index to version `0.2.0`.
- Expanded the context pack from human-readable planning docs to a mixed human-readable plus machine-readable agentability layer.
- Clarified that APFS-specific agent templates are stored under the APFS context pack and should not overwrite the Codev repository root agent instructions.

### Safety

- Added explicit safety-gate registry for read-only default, raw-device access, image-only write lab, no physical write path, secret redaction, dependency review, and unsafe-code review.
- Added default allow/refuse behaviour for unsupported, corrupt, encrypted, Fusion, snapshot, and write states.
- Added write-safety-specific path instructions requiring image-only write evidence before physical write beta.

### Automation

- Added intended GitHub rulesets, protected paths, required checks, least-privilege workflow policy, merge-queue notes, and capability enforcement checks.
- Added command facade recommendations so humans and coding agents can run stable commands that mirror CI.
- Added future read-only MCP interface to expose capability, fixture, safety, dependency, spec, plan, and review context to agents.

### Compatibility

- Added fixture coverage mapping for MVP, advanced read, software-encryption read, and image-only write lab milestones.
- Added release engineering gates requiring compatibility snapshots and evidence-backed release notes.

## [0.1.0] - 2026-06-23

### Added

- Added APFS-RS Codev context pack index.
- Added project charter and scope spec.
- Added MoSCoW requirements spec.
- Added detailed APFS capability matrix.
- Added architecture and design resource with Mermaid diagrams.
- Added roadmap tracks and initial issue backlog.
- Added library and dependency strategy, including candidate Rust crates, Windows bridge libraries, FUSE options, supply-chain controls, and dependency evaluation rules.
- Added CI/CD, code quality, GitHub automation, testing, fuzzing, fixture, and release plan.
- Added GitHub automation template resource covering issue templates, pull request templates, CODEOWNERS, Dependabot, required checks, and automation backlog.
- Added versioning and governance policy.
- Added initial architecture review.

### Safety

- Established read-only default posture.
- Established image-only write lab requirement before any physical external-volume write beta.
- Established refusal policy for unknown incompatible feature states, damaged metadata, unsupported encryption states, sealed system roles, and multi-device/Fusion cases until dedicated specs exist.
- Established agent safety rule: builders must use fixtures and disposable images only, not raw-device write access.

### Compatibility

- Initial platform priority captured: Windows first, then Linux, ChromeOS, macOS, Android.
- Initial capability targets created for MVP, advanced read, software-encryption read, image-only write lab, Windows write beta, and later cross-platform adapters.

### Documentation

- Created traceability structure under Codev: specs, plans, reviews, and resources.
- Added document version headers to all initial artifacts.
