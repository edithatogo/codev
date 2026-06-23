# APFS-RS GitHub Automation Templates

Document version: 0.1.0  
Status: Draft templates for future implementation repository  
Date: 2026-06-23

These templates are intended for the future `apfs-rs` implementation repository. They are stored here as versioned Codev context so the project can adopt them when code scaffolding begins.

## Issue template: capability implementation

```yaml
name: APFS capability
about: Specify, plan, and implement one APFS capability through Codev/SPIR
labels: [kind:spec]
body:
  - type: input
    id: capability_id
    attributes:
      label: Capability ID
      description: Link to capabilities matrix row, e.g. M-008 or R1-snapshots
    validations:
      required: true
  - type: dropdown
    id: track
    attributes:
      label: Track
      options:
        - governance
        - core-read
        - windows-mvp
        - advanced-read
        - encryption-read
        - write-lab
        - windows-write-beta
        - cross-platform
        - packaging
        - docs-community
    validations:
      required: true
  - type: dropdown
    id: priority
    attributes:
      label: MoSCoW priority
      options: [Must, Should, Could, Won't-yet]
    validations:
      required: true
  - type: textarea
    id: goal
    attributes:
      label: Goal
      description: What user-visible or engineering result should exist after this issue?
    validations:
      required: true
  - type: textarea
    id: acceptance
    attributes:
      label: Acceptance criteria
      description: Include fixture, CLI, mount, and CI evidence requirements.
    validations:
      required: true
  - type: textarea
    id: safety
    attributes:
      label: Safety and security notes
      description: Include raw-device, write, secret, unsafe-code, and unsupported-state implications.
    validations:
      required: true
```

## Pull request template

```markdown
## Linked context

- Issue:
- Spec:
- Plan:
- Capability matrix row:

## Change summary

## Tests and evidence

- [ ] Unit tests
- [ ] Integration tests
- [ ] Fixture manifest updated
- [ ] Fuzz target or fuzz-smoke run
- [ ] Differential test evidence
- [ ] Windows smoke evidence where applicable

## Safety review

- [ ] No write path added
- [ ] Write path is image-lab only
- [ ] Unsupported APFS states fail safely
- [ ] No secrets logged
- [ ] No unsafe code added
- [ ] Unsafe code added with documented invariants and reviewer sign-off

## Dependency review

- [ ] No new dependencies
- [ ] New dependencies reviewed for licence, maintenance, unsafe code, and advisories

## Documentation

- [ ] Capability matrix updated
- [ ] Changelog updated
- [ ] Review notes added or updated
```

## CODEOWNERS sketch

```text
/crates/apfs-types/       @apfs-rs/core-maintainers
/crates/apfs-core/        @apfs-rs/core-maintainers
/crates/apfs-read/        @apfs-rs/core-maintainers
/crates/apfs-write/       @apfs-rs/write-safety-maintainers
/crates/apfs-crypto/      @apfs-rs/security-maintainers
/crates/apfs-win/         @apfs-rs/windows-maintainers
/crates/apfs-fuse/        @apfs-rs/platform-maintainers
/fuzz/                    @apfs-rs/security-maintainers @apfs-rs/core-maintainers
/fixtures/                @apfs-rs/test-infra-maintainers
/codev/specs/             @apfs-rs/architects
/codev/plans/             @apfs-rs/architects
/codev/reviews/           @apfs-rs/architects
/.github/                 @apfs-rs/maintainers
```

## Dependabot template

```yaml
version: 2
updates:
  - package-ecosystem: cargo
    directory: /
    schedule:
      interval: weekly
    open-pull-requests-limit: 10
    groups:
      rust-patch-minor:
        update-types: [patch, minor]
  - package-ecosystem: github-actions
    directory: /
    schedule:
      interval: weekly
```

## Required GitHub checks

Required for `main` once implementation begins:

- `ci / rust (ubuntu-latest, stable)`
- `ci / rust (windows-latest, stable)`
- `ci / rust (macos-latest, stable)`
- `security / supply-chain`
- `docs / markdown`
- `fuzz-smoke / parser-targets`
- `coverage / llvm-cov`
- `platform / windows-readonly-smoke` when available

## Automation backlog

| Automation | Priority | Notes |
|---|---|---|
| PR labeler | Must | Auto-label by path: core, windows, docs, fuzz, fixtures. |
| Stale issue policy | Could | Do not auto-close safety/security issues. |
| Release drafter | Should | Generate release notes from labels. |
| Changelog checker | Must | Require changelog or explicit no-changelog label. |
| Capability matrix checker | Must | Parser/mount/feature PRs must touch matrix or explain why not. |
| Mermaid render check | Should | Ensure diagrams render before merge. |
| SARIF upload | Should | Use for clippy-compatible or third-party analysis tools that produce SARIF. |
| SBOM generation | Should before release | Required for public binaries. |
| Artifact attestation | Should before release | Required for signed release pipeline. |
