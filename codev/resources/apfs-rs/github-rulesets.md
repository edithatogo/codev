# APFS-RS GitHub Rulesets and Repository Controls

Document version: 0.2.0  
Status: Draft  
Date: 2026-06-23

## Purpose

Rulesets and branch protections should enforce the APFS-RS safety model rather than relying only on contributor discipline. This file defines the intended controls for the future implementation repository.

## Main branch ruleset

Target: `main`

Required rules:

- Require pull request before merge.
- Require approvals.
- Dismiss stale approvals after new commits.
- Require conversation resolution.
- Require status checks.
- Require merge queue when project activity justifies it.
- Require linear history or squash merges.
- Block force pushes.
- Block deletions.
- Restrict bypass actors.

Required checks:

```text
ci / rust (ubuntu-latest)
ci / rust (windows-latest)
ci / rust (macos-latest)
security / supply-chain
security / codeql
fuzz-smoke / parser-targets
docs / markdown-mermaid
coverage / llvm-cov
capability-check / registry-and-matrix
```

## Release tag ruleset

Target: `v*`

Required rules:

- Block tag deletion.
- Require signed tag or release-manager approval.
- Require release workflow success.
- Require changelog update.
- Require compatibility snapshot.
- Require SBOM and checksums.
- Require artifact attestation where available.

## Protected paths

Changes to these paths should trigger additional review:

| Path | Required review |
|---|---|
| `crates/apfs-write/**` | write-safety maintainer |
| `crates/apfs-crypto/**` | security maintainer |
| `crates/apfs-win/**` | Windows maintainer |
| `crates/apfs-types/**` | core maintainer |
| `crates/apfs-core/**` | core maintainer |
| `fuzz/**` | security/core maintainer |
| `fixtures/**` | test-infra maintainer |
| `.github/workflows/**` | maintainer/security maintainer |
| `codev/resources/apfs-rs/safety-gates.yaml` | architect/security maintainer |
| `codev/resources/apfs-rs/dependency-policy.yaml` | security maintainer |

## GitHub Actions permissions

Default workflow permissions should be read-only:

```yaml
permissions:
  contents: read
```

Escalate per job only when required, for example:

```yaml
permissions:
  contents: read
  security-events: write
```

Release workflows should use environment protection and least-privilege tokens.

## Merge queue notes

When merge queue is enabled, required workflows must also trigger on `merge_group`:

```yaml
on:
  pull_request:
  merge_group:
```

This avoids PRs passing individually but failing after queue integration.

## Capability enforcement checks

A custom CI check should fail when:

- Code under a capability-owned path changes without touching `capabilities.yaml` or declaring `no-capability-impact`.
- Parser changes lack a fuzz-smoke target or explicit exemption.
- `crates/apfs-write/**` changes without a write-safety review label.
- `unsafe` appears in a diff without an unsafe review block.
- New dependencies appear without a dependency review entry.
- CLI JSON output changes without schema/version note.

## Secret and fixture controls

- Enable secret scanning.
- Block commits containing recovery keys, test passwords outside allowed secret fixtures, or raw private disk data.
- Large fixture artifacts should be generated or stored outside Git.
- Diagnostic bundles committed as tests must be redacted.

## Repository setup checklist

- [ ] Ruleset for `main`.
- [ ] Ruleset for release tags.
- [ ] CODEOWNERS.
- [ ] Required workflows.
- [ ] Merge queue trigger support.
- [ ] Dependabot.
- [ ] CodeQL.
- [ ] Dependency Review Action.
- [ ] OpenSSF Scorecard.
- [ ] Secret scanning.
- [ ] Security policy.
