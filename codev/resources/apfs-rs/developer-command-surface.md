# APFS-RS Developer Command Surface

Document version: 0.2.0  
Status: Draft  
Date: 2026-06-23

## Purpose

Humans and coding agents need stable commands that mirror CI. This file defines a future `justfile`/`xtask` command facade for the implementation repository.

## Recommended approach

Use a small command facade with either:

- `justfile` for simple shell command orchestration, and/or
- `xtask` for Rust-native automation.

The important property is not the tool; it is that agents can run obvious commands without reverse-engineering CI YAML.

## Required commands

| Command | Purpose |
|---|---|
| `just agent-check` | Full local pre-PR check for most changes. |
| `just agent-docs-check` | Markdown, Mermaid, links, and Codev doc consistency. |
| `just agent-core-read-check` | Core parser/read tests, fixture smoke, parser fuzz smoke. |
| `just agent-windows-check` | Windows build and image smoke checks. |
| `just dependency-check` | cargo deny/audit/vet/tree/machete. |
| `just fixture-check <fixture-id>` | Validate one fixture manifest and expected outputs. |
| `just fuzz-smoke <target>` | Short fuzz run for a named target. |
| `just safety-check` | Detect unsafe, write-path, dependency, and capability-registry violations. |
| `just coverage` | Coverage report. |
| `just release-dry-run` | Build release artifacts without publishing. |

## Example justfile sketch

```make
agent-check:
    cargo fmt --all -- --check
    cargo clippy --workspace --all-targets --all-features -- -D warnings
    cargo nextest run --workspace --all-features
    just dependency-check
    just safety-check

agent-docs-check:
    markdownlint-cli2 "**/*.md"
    npx -y @mermaid-js/mermaid-cli --version

agent-core-read-check:
    cargo nextest run -p apfs-types -p apfs-core -p apfs-read
    just fuzz-smoke object-header
    just fuzz-smoke btree-node

dependency-check:
    cargo deny check
    cargo audit
    cargo vet --locked
    cargo tree --duplicates

fuzz-smoke target:
    cargo fuzz run {{target}} -- -max_total_time=60
```

## xtask candidates

`xtask` can provide cross-platform logic for:

- Fixture manifest validation.
- Capability registry checks.
- Safety gate checks.
- Changelog/version consistency.
- Release dry-run orchestration.
- Windows mount smoke orchestration.

Example:

```bash
cargo xtask capability-check
cargo xtask fixture-check simple-unencrypted-case-sensitive-001
cargo xtask safety-check --changed-files changed.txt
cargo xtask release-evidence
```

## Agent rule

Issue task packets should list exact commands from this file. Agents should not guess commands when a command facade exists.
