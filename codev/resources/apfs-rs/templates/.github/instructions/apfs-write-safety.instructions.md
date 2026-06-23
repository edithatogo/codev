# APFS Write-Safety Instructions

Template version: 0.2.0  
Applies to: `crates/apfs-write/`, transaction planning, image creation, write lab, write beta

## Non-negotiable rule

No physical-device write support may be implemented, enabled, or tested until an accepted write-beta spec, accepted plan, and image-only write-lab evidence bundle exist.

## Write-lab scope

Allowed before beta:

- Disposable sparse files.
- Synthetic APFS images.
- Image-only transaction plans.
- Crash-injection tests.
- macOS differential validation on disposable images.

Forbidden before beta:

- Raw physical-disk writes.
- Encrypted writes.
- Sealed system volume writes.
- Fusion/multi-device writes.
- Writes to damaged metadata.
- Writes when unknown incompatible feature flags exist.

## Required evidence for every write operation

- Transaction plan lists every object mutation.
- Failure injection after every write step.
- Old or new checkpoint remains valid after simulated crash.
- macOS can mount/verify the resulting disposable image.
- Compatibility and safety-refusal matrices are updated.

## Review trigger

Write-safety maintainer review is mandatory for all changes in this area. Security-maintainer review is mandatory if write code touches encrypted state, key material, diagnostics, or FFI.
