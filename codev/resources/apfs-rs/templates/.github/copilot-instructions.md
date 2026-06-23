# Copilot Instructions for APFS-RS

Template version: 0.2.0  
Intended location in implementation repo: `.github/copilot-instructions.md`

Follow the repository-level `AGENTS.md` first. This file adapts the same rules for GitHub Copilot and Copilot coding agent workflows.

## Project intent

APFS-RS is a clean-room Rust implementation for APFS inspection, extraction, mounting, and eventually carefully gated writing. Windows read-only support is the first priority.

## Before generating code

- Identify the relevant Codev spec and plan.
- Identify the capability ID in `codev/resources/apfs-rs/capabilities.yaml`.
- Check `codev/resources/apfs-rs/safety-gates.yaml` before touching raw-device, crypto, unsafe, or write paths.
- Prefer the smallest vertical slice with tests and fixture evidence.

## Strong defaults

- Use safe Rust in core crates.
- Use typed errors rather than panics.
- Refuse unsupported APFS states safely.
- Do not add dependencies unless the issue explicitly asks for dependency evaluation.
- Keep APFS logic out of platform adapters.

## Never suggest or implement without accepted spec

- Physical-device writes.
- Hardware-bound encryption unlock.
- Password recovery or cracking.
- Repair or format behaviour.
- Kernel-mode Windows filesystem driver.

## PR expectations

Generated PRs must include tests, documentation/capability updates, and explicit safety notes. If a change touches parser, compression, crypto, unsafe, or write code, the PR description must call that out.
