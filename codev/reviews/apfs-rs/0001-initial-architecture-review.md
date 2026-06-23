# Review 0001: Initial APFS-RS Architecture Review

Document version: 0.1.0  
Status: Initial review  
Date: 2026-06-23  
Codev phase: Review

## Review scope

This review covers the initial APFS-RS planning context:

- Project charter and scope.
- MoSCoW requirements.
- Capabilities matrix.
- Architecture and design.
- Roadmap tracks.
- Library/dependency strategy.
- CI/CD and quality plan.
- Versioning and governance.

No implementation code was reviewed because this context pack is planning-only.

## Summary judgement

The proposed direction is sound if the project stays disciplined about safety and scope. The highest-confidence first release is Windows read-only APFS image/external-volume access through a user-mode filesystem bridge. Write support should remain unavailable for physical volumes until the image-only write lab provides crash-consistency evidence.

## Strong decisions

1. **Shared Rust core with platform adapters** — prevents platform forks and duplicated APFS semantics.
2. **Windows first with WinFsp** — focuses the product on the highest immediate user value without writing a custom kernel filesystem driver.
3. **Read-only MVP** — gives users useful APFS access while avoiding early data-loss risk.
4. **Codev/SPIR traceability** — suits a complex filesystem project where requirements, plans, implementation evidence, and reviews must stay linked.
5. **Compatibility matrix** — avoids vague APFS support claims.
6. **Image-only write lab** — correct safety gate before any physical-device write beta.
7. **CI/CD-first approach** — filesystem correctness depends on continuous fixture, fuzz, and differential evidence.

## Principal risks

| Risk | Severity | Review note |
|---|---:|---|
| APFS write support causes data loss | Critical | Keep physical-device writes unavailable until lab evidence and governance approval. |
| Undocumented/new APFS feature combinations | High | Refuse unknown incompatible features, especially for writes. |
| Windows adapter instability | High | Keep WinFsp integration minimal and tested with Explorer/PowerShell workloads. |
| Licence contamination | High | Maintain clean-room boundary; compare existing projects but do not copy code into permissive core. |
| Encrypted volume handling leaks sensitive material | High | Delay until dedicated security review and redaction tests. |
| Fixture corpus gaps cause false confidence | High | Treat compatibility matrix as evidence-backed, not aspirational. |
| Unicode/case mapping surprises on Windows | Medium/High | Needs dedicated ADR and tests. |
| FUSE/macFUSE adapter differences | Medium | Keep platform adapter semantics thin and reuse `apfs-vfs`. |
| Agent automation performs unsafe operations | Medium/High | Enforce fixtures/disposable images only. |

## Assumptions to validate early

1. WinFsp adapter can expose the needed read-only semantics cleanly from Rust.
2. APFS object parsing can be implemented with limited unsafe code.
3. Generated macOS fixture corpus can cover enough APFS combinations without distributing personal or proprietary data.
4. Compression libraries can pass APFS-specific fixture tests, not just generic compression tests.
5. Windows raw-device read-only access works reliably across common permission and drive states.
6. CI can run useful Windows mount smoke tests without brittle privileged setup, or a self-hosted runner will be needed.

## Recommended first implementation slice

The first implementation should be deliberately narrow:

1. Repository skeleton.
2. `apfs-types` object header definitions and checksum validation.
3. `apfs-blockdev` read-only image backend.
4. `apfs-core` container superblock parser.
5. `apfs-cli inspect disk.img`.
6. Fixture: one minimal APFS image generated on macOS with manifest.
7. CI: format, clippy, tests, docs, deny/audit, and parser fuzz smoke.

This slice proves the repo, fixtures, parser style, CI, and Codev workflow without taking on Windows mount complexity immediately.

## Required ADRs before major implementation

1. Parser strategy for APFS structs.
2. WinFsp binding strategy.
3. Unicode and case mapping policy.
4. Fixture generation and distribution policy.
5. Compression implementation strategy.
6. Software-encryption dependency and key-handling strategy.
7. Write transaction model.

## Review comments by document

### Charter and scope

The charter correctly prioritises Windows read-only access and makes write safety explicit. The non-goals are important and should remain visible in the project README once implementation begins.

### MoSCoW requirements

The MoSCoW split is useful. The MVP is still ambitious; the team should resist adding compression, snapshots, or encryption to the first Windows read-only mount milestone unless the simple read path is already reliable.

### Capabilities matrix

The matrix should be updated in every capability PR. It should eventually include columns for fixture IDs and release versions.

### Architecture design

The crate split is appropriate. The main risk is too many crates too early. Start with fewer crates if needed, but keep logical boundaries clear so crates can split later.

### Dependency strategy

The dependency posture is appropriately conservative. Early ADRs should decide whether APFS structs use manual parsing, `zerocopy`, or parser combinators. WinFsp integration should be prototyped before committing to a binding strategy.

### CI/CD plan

The plan is strong. The project should treat fuzzing, fixture manifests, and compatibility matrix updates as required gates, not nice-to-have quality extras.

### Governance

The governance model is reasonable. In early project stages, roles may be held by one maintainer, but the PR template should still require explicit role-based review questions.

## Follow-up issues to create

1. Create implementation repository skeleton.
2. Add Codev templates and PR/issue templates.
3. Create ADR-0001 parser strategy.
4. Create ADR-0002 WinFsp binding strategy.
5. Build minimal fixture generation script.
6. Implement `apfs inspect` vertical slice.
7. Add first fuzz target.
8. Add compatibility matrix fixture ID columns.
9. Add Windows mount prototype spike.
10. Add write-lab transaction design placeholder spec.

## Review outcome

Approved as initial planning context, with one condition:

> Do not begin write implementation until read-only core and fixture/differential testing are mature enough to detect subtle metadata inconsistencies.
