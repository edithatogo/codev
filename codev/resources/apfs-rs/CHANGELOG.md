# APFS-RS Context Pack Changelog

All notable planning-context changes for the APFS-RS Codev pack are recorded here.

Document set version: 0.1.0  
Date: 2026-06-23

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
