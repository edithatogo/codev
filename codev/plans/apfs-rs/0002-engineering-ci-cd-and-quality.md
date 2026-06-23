# Plan 0002: Engineering, CI/CD, Code Quality, and GitHub Automation

Document version: 0.1.0  
Status: Draft  
Date: 2026-06-23  
Codev phase: Plan

## Goal

Maximise correctness, safety, automation, and development throughput using GitHub-native workflows, Codev/SPIR, strong Rust quality gates, and filesystem-specific validation.

This plan treats CI/CD as a product feature. APFS tooling must prove safety continuously, especially before any write capability is made available.

## Engineering principles

1. **Context before code** — every major capability starts as a Codev spec and plan.
2. **Vertical slices** — deliver end-to-end inspect/list/read/mount capabilities with fixtures.
3. **Typed failure** — corrupt input and unsupported features return structured errors, not panics.
4. **Platform isolation** — OS-specific code lives only in adapter crates.
5. **Read-only default** — write code is feature-gated and lab-only until proven.
6. **No unreviewed unsafe** — every unsafe block has a documented invariant and maintainer review.
7. **Corpus-driven confidence** — fixture images, manifests, fuzzing, and differential tests drive acceptance.
8. **Automation-first** — all routine checks run in GitHub before review.

## GitHub repository controls

### Branch protection

Require for `main`:

- Pull request review required.
- Required status checks.
- Linear history or squash merges.
- No force pushes.
- Dismiss stale approvals after new commits.
- Require conversation resolution.
- Require signed commits or release signing decision, if adopted by maintainers.

### CODEOWNERS

Suggested ownership boundaries:

```text
/crates/apfs-types/       @core-maintainers
/crates/apfs-core/        @core-maintainers
/crates/apfs-read/        @core-maintainers
/crates/apfs-write/       @write-safety-maintainers
/crates/apfs-crypto/      @security-maintainers
/crates/apfs-win/         @windows-maintainers
/crates/apfs-fuse/        @platform-maintainers
/fuzz/                    @security-maintainers @core-maintainers
/fixtures/                @test-infra-maintainers
/codev/specs/             @architects
/codev/plans/             @architects
/codev/reviews/           @architects
/.github/                 @maintainers
```

### Labels

- `track:governance`
- `track:core-read`
- `track:windows-mvp`
- `track:advanced-read`
- `track:encryption-read`
- `track:write-lab`
- `track:cross-platform`
- `kind:spec`
- `kind:plan`
- `kind:implementation`
- `kind:test`
- `kind:docs`
- `risk:critical-data-loss`
- `risk:security-sensitive`
- `risk:platform-specific`
- `safe:first-issue`
- `needs:fixture`
- `needs:adr`

## Required workflow set

| Workflow | Trigger | Required for merge | Purpose |
|---|---|---:|---|
| `ci.yml` | PR, push | Yes | Format, clippy, build, test, docs. |
| `platform.yml` | PR, push | Yes once adapters exist | Windows/Linux/macOS matrix. |
| `security.yml` | PR, schedule | Yes | Dependency, licence, advisory, code scanning. |
| `fuzz-smoke.yml` | PR | Yes for parser changes | Short fuzz run for changed parser targets. |
| `fuzz-long.yml` | schedule, manual | No, monitored | Long fuzzing and corpus artifact upload. |
| `coverage.yml` | PR, push | Yes after threshold set | Coverage report and trend artifact. |
| `fixtures.yml` | manual/protected | No | Generate fixture manifests on controlled macOS runner. |
| `docs.yml` | PR, push | Yes for docs | Markdown, Mermaid, mdbook/docs build. |
| `release.yml` | tag | Yes for release | Build, sign, SBOM, checksums, attestations. |

## CI workflow sketch

```yaml
name: ci

on:
  pull_request:
  push:
    branches: [main]

permissions:
  contents: read

jobs:
  rust:
    strategy:
      fail-fast: false
      matrix:
        os: [ubuntu-latest, windows-latest, macos-latest]
        toolchain: [stable]
    runs-on: ${{ matrix.os }}
    steps:
      - uses: actions/checkout@v4
      - uses: dtolnay/rust-toolchain@stable
        with:
          components: rustfmt, clippy
      - uses: Swatinem/rust-cache@v2
      - run: cargo fmt --all -- --check
      - run: cargo clippy --workspace --all-targets --all-features -- -D warnings
      - run: cargo test --workspace --all-features
      - run: cargo doc --workspace --all-features --no-deps
        env:
          RUSTDOCFLAGS: -D warnings
```

## Security workflow sketch

```yaml
name: security

on:
  pull_request:
  schedule:
    - cron: '0 3 * * 1'

permissions:
  contents: read
  security-events: write

jobs:
  supply-chain:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: dtolnay/rust-toolchain@stable
      - uses: Swatinem/rust-cache@v2
      - run: cargo install --locked cargo-deny cargo-audit cargo-vet cargo-semver-checks
      - run: cargo deny check
      - run: cargo audit
      - run: cargo vet --locked || true
      - run: cargo semver-checks check-release || true
```

## Code quality gates

### Required before MVP merge

- `cargo fmt --check`.
- `cargo clippy --workspace --all-targets --all-features -- -D warnings`.
- `cargo test --workspace --all-features`.
- `cargo doc --workspace --no-deps` with warnings denied.
- `cargo deny check`.
- `cargo audit`.
- Fixture manifest validation for affected features.
- Fuzz smoke for changed parser code.
- No new unsafe without documented safety invariants.

### Required before advanced read release

- Coverage threshold agreed and enforced.
- Long fuzz jobs scheduled.
- Corpus minimisation workflow.
- Platform matrix includes Windows, Linux, and macOS builds.
- Compression fixtures across ZLIB, LZVN, and LZFSE.
- Snapshot fixture validation.

### Required before software-encryption read release

- Security review completed.
- Secret redaction tests.
- Zeroisation checks.
- Fuzzing for keybag parser.
- Dependency review for all crypto crates.

### Required before image-only write lab release

- Crash-injection harness.
- Random operation tests.
- macOS differential verifier.
- Transaction plan coverage.
- No physical-device write path enabled.

### Required before Windows write beta

- Exclusive lock tests.
- Dry-run mutation journal.
- Preflight verifier.
- Safety refusal matrix.
- Signed beta binaries.
- Public warnings and backup guidance.

## Test architecture

### Unit tests

- Fixed struct parsing.
- Endianness.
- Feature flags.
- Object ID/transaction ID ordering.
- Error mapping.

### Integration tests

- Fixture image inspect/list/extract.
- Windows mount smoke.
- CLI JSON output schema.
- Unsupported-feature refusal.

### Differential tests

- macOS-generated manifest vs `apfs-rs` output.
- File hashes.
- Directory tree shape.
- Metadata where representable.
- Write lab images remounted and verified by macOS.

### Property tests

- B-tree node boundaries.
- Object map lookups.
- Path resolution.
- Extent coalescing.
- Transaction planning invariants.

### Fuzz targets

| Target | Inputs | Expected result |
|---|---|---|
| Object header parser | arbitrary bytes | typed error or valid object, no panic. |
| Checkpoint selector | mutated checkpoint metadata | safe selection or refusal. |
| B-tree node parser | arbitrary/mutated nodes | typed error or valid traversal. |
| OMAP lookup | generated object maps | no invalid memory access or loops. |
| Compression dispatch | arbitrary compressed payloads | bounded error or valid decompression. |
| Keybag parser | arbitrary bytes | typed error or valid parse, no secret leak. |
| Transaction planner | generated operations | invariants hold. |

## Fixture strategy

Fixtures should be generated, documented, and minimised.

Each fixture requires:

```yaml
fixture_id: simple-unencrypted-case-sensitive-001
created_with: macOS version and command script
apfs_features:
  encrypted: false
  compressed: false
  snapshots: false
  case_sensitive: true
expected:
  manifest: manifest.json
  hash_algorithm: sha256
safe_to_commit: true
notes: no personal data, generated synthetic files only
```

Large or sensitive fixtures should not be committed. Store generation scripts and redacted manifests instead.

## Release automation

### Release artifacts

- Windows CLI binary.
- Windows installer package.
- Optional portable ZIP.
- Linux binaries later.
- macOS binaries later if useful.
- SBOM.
- SHA-256 checksums.
- Signature or provenance attestation.
- Compatibility matrix snapshot.

### Release gates

- All required CI green.
- Changelog updated.
- Version tag matches SemVer policy.
- Compatibility matrix updated.
- Known unsupported cases listed.
- Security review complete for security-sensitive releases.

## Dependabot plan

Add `.github/dependabot.yml` when implementation repo exists:

```yaml
version: 2
updates:
  - package-ecosystem: cargo
    directory: /
    schedule:
      interval: weekly
    groups:
      rust-patch-minor:
        update-types: [patch, minor]
  - package-ecosystem: github-actions
    directory: /
    schedule:
      interval: weekly
```

## Codev/SPIR automation plan

### Issue template fields

- Capability ID.
- Track.
- MoSCoW priority.
- Target milestone.
- Safety risk.
- Required fixtures.
- Required CI gates.
- Spec link.
- Plan link.
- Review link after merge.

### Pull request template fields

- Linked issue/spec/plan.
- Capability matrix update.
- Tests added.
- Fixtures added/updated.
- Unsafe code review.
- Dependency review.
- Compatibility impact.
- Security/redaction impact.

### Review template fields

- What changed.
- What was learned.
- Bugs found.
- Spec updates needed.
- Plan updates needed.
- Capability matrix updates.
- Follow-up issues.

## Agent farm safety rules

- Builders work on fixture images only.
- Builders do not receive raw-device write permissions.
- Write-lab tasks use disposable sparse images in temporary directories.
- Security-sensitive tasks require human plan approval before implementation.
- Any dependency addition requires explicit review.
- Any unsafe code requires explicit review.
- Builders must update reviews after implementation.

## Metrics

Track these metrics in the project dashboard:

| Metric | Why it matters |
|---|---|
| Fixture coverage by APFS feature | Prevents vague compatibility claims. |
| Fuzz coverage and crashes | Measures parser robustness. |
| Differential mismatches | Tracks correctness against macOS-generated truth. |
| Unsafe LOC and unsafe blocks | Maintains memory-safety posture. |
| Dependency count and duplicate crates | Controls supply-chain surface. |
| CI duration | Keeps contributor loop healthy. |
| Windows mount smoke success rate | Measures primary MVP usability. |
| Open critical-risk issues | Keeps data-loss/security risks visible. |

## Initial implementation workflow

1. Architect opens issue from roadmap.
2. Architect writes/updates spec.
3. Builder writes plan.
4. Human reviews plan for safety and scope.
5. Builder implements in branch/worktree.
6. CI runs required gates.
7. PR includes capability matrix and review updates.
8. Maintainer merges.
9. Review document captures lessons and follow-ups.
