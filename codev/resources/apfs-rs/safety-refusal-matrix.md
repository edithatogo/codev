# APFS-RS Safety Refusal Matrix

Document version: 0.2.0  
Status: Draft  
Date: 2026-06-23

## Purpose

This matrix defines the default behaviour when APFS-RS sees unsupported, ambiguous, damaged, or high-risk APFS states. It should be mirrored by CLI diagnostics, mount adapters, tests, and agent safety checks.

## Legend

- **Allow** — operation may proceed if all other checks pass.
- **Diagnostic only** — metadata inspection may proceed, but content/mount/write operations are blocked.
- **Refuse** — fail safely with a stable error code.
- **Later spec** — blocked until a dedicated accepted spec changes the policy.

## Matrix

| Situation | Inspect | Volumes | List | Extract | Mount RO | Write image lab | Write physical |
|---|---:|---:|---:|---:|---:|---:|---:|
| Simple unencrypted supported image | Allow | Allow | Allow | Allow | Allow | Later spec | Refuse |
| Simple unencrypted supported external disk | Allow | Allow | Allow | Allow | Allow | N/A | Later spec |
| Unknown compatible feature | Allow | Allow | Diagnostic only | Diagnostic only | Diagnostic only | Refuse | Refuse |
| Unknown incompatible feature | Allow | Allow | Refuse | Refuse | Refuse | Refuse | Refuse |
| Metadata checksum mismatch | Allow | Diagnostic only | Refuse | Refuse | Refuse | Refuse | Refuse |
| Invalid checkpoint set | Allow | Diagnostic only | Refuse | Refuse | Refuse | Refuse | Refuse |
| B-tree cycle or impossible reference | Allow | Allow | Refuse | Refuse | Refuse | Refuse | Refuse |
| Unsupported compression method | Allow | Allow | Allow metadata | Refuse affected file | Refuse affected file or mount with errors | Refuse | Refuse |
| Supported compression method | Allow | Allow | Allow | Allow | Allow | Later spec | Refuse |
| Unsupported software encryption | Allow | Allow metadata | Refuse | Refuse | Refuse | Refuse | Refuse |
| Supported software encryption with valid secret | Allow | Allow | Allow | Allow | Allow | Refuse initially | Refuse |
| Invalid secret | Allow | Allow metadata | Refuse | Refuse | Refuse | Refuse | Refuse |
| Hardware-bound internal-device encryption | Allow | Allow metadata | Refuse | Refuse | Refuse | Refuse | Refuse |
| Fusion/multi-device container | Allow | Diagnostic only | Refuse | Refuse | Refuse | Refuse | Refuse |
| Sealed system volume | Allow | Allow | Allow if read implemented | Allow if read implemented | Allow if read implemented | Refuse | Refuse |
| Snapshot read requested | Allow | Allow | Allow if implemented | Allow if implemented | Allow if implemented | Refuse | Refuse |
| Snapshot mutation requested | Allow | Allow | N/A | N/A | N/A | Later spec | Refuse |
| Damaged metadata | Allow | Diagnostic only | Refuse | Refuse | Refuse | Refuse | Refuse |
| Concurrent mount suspected | Allow | Allow | Allow read-only if safe | Allow read-only if safe | Refuse if unsafe | Refuse | Refuse |
| Source opened without read permission | Refuse | Refuse | Refuse | Refuse | Refuse | Refuse | Refuse |
| Write requested without explicit lab/beta flag | Allow | Allow | Allow | Allow | Read-only only | Refuse | Refuse |

## Stable error code families

| Code family | Meaning |
|---|---|
| `APFS-E-UNSUPPORTED-FEATURE` | Feature is detected but not implemented. |
| `APFS-E-INCOMPATIBLE-FEATURE` | Feature blocks safe operation. |
| `APFS-E-CHECKSUM-MISMATCH` | Metadata checksum validation failed. |
| `APFS-E-CORRUPT-METADATA` | Metadata structure is inconsistent. |
| `APFS-E-ENCRYPTED-UNSUPPORTED` | Volume is encrypted and cannot be unlocked by supported path. |
| `APFS-E-HARDWARE-BOUND-ENCRYPTION` | Hardware-bound/internal encryption is unsupported. |
| `APFS-E-FUSION-UNSUPPORTED` | Multi-device/Fusion APFS is unsupported. |
| `APFS-E-WRITE-BLOCKED` | Write request blocked by safety policy. |
| `APFS-E-RAW-DEVICE-PERMISSION` | Raw-device access permission failure. |

## Update rule

Any PR that changes one of these behaviours must update this matrix, `safety-gates.yaml`, the CLI UX spec, and the relevant tests.
