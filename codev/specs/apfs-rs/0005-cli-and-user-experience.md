# Spec 0005: CLI and User Experience

Document version: 0.2.0  
Status: Draft  
Date: 2026-06-23  
Codev phase: Specify

## Purpose

APFS-RS should be safe and understandable for users, not just technically correct. This spec defines the CLI, diagnostics, structured output, error explanation, and user-facing safety model.

## UX principles

1. Default to read-only.
2. Explain why an operation is refused.
3. Provide machine-readable JSON for automation and agents.
4. Never hide unsupported APFS states.
5. Never log secrets.
6. Avoid vague “supports APFS” claims.
7. Make dry-run and compatibility reporting first-class.
8. Make Windows read-only mounting simple.

## Core commands

| Command | Milestone | Purpose |
|---|---|---|
| `apfs inspect <source>` | MVP | Inspect container metadata, feature flags, checkpoints, and safety status. |
| `apfs volumes <source>` | MVP | List volumes, UUIDs, roles, encryption state, and support status. |
| `apfs compatibility-report <source>` | MVP | Report which operations are safe/supported/refused. |
| `apfs ls <source>:/Volume/path` | MVP | List directory contents. |
| `apfs cat <source>:/Volume/path/file` | MVP | Stream file contents to stdout. |
| `apfs extract <source>:/Volume/path <dest>` | MVP | Extract file or directory tree safely. |
| `apfs mount <source> <mountpoint> --readonly` | MVP | Mount selected volume read-only. |
| `apfs mount --dry-run <source> <mountpoint>` | MVP | Explain whether mount would be allowed. |
| `apfs verify-read <source> --manifest manifest.json` | MVP | Compare tree and hashes with fixture manifest. |
| `apfs explain <error-code>` | MVP | Explain a structured error and safe next steps. |
| `apfs diagnostics export --redacted` | MVP/R1 | Export metadata for bug reports without secrets. |
| `apfs snapshots <source>` | R1 | List snapshots. |
| `apfs xattr list/read` | R1 | Read extended attributes. |
| `apfs unlock <source>` | R2 | Software-encryption unlock flow. |
| `apfs image create` | W-Lab | Create disposable image for lab testing. |
| `apfs-lab mount-rw` | W-Lab | Explicit image-only read-write lab mount. |

## Compatibility report

`apfs compatibility-report` should be the primary user and automation entry point.

Example JSON:

```json
{
  "schema_version": "0.2.0",
  "source": "disk.img",
  "source_type": "disk_image",
  "safe_to_inspect": true,
  "safe_to_extract": true,
  "safe_to_mount_readonly": true,
  "safe_to_write_image": false,
  "safe_to_write_physical": false,
  "selected_checkpoint": "latest-valid",
  "volumes": [
    {
      "name": "Data",
      "uuid": "00000000-0000-0000-0000-000000000000",
      "role": "data",
      "encrypted": false,
      "support": "supported-readonly"
    }
  ],
  "unsupported_features": [],
  "warnings": [],
  "required_next_steps": []
}
```

## Error model

Every user-facing error should include:

- Stable error code.
- Human-readable message.
- Operation attempted.
- Safety class.
- Whether retrying can help.
- Suggested next step.
- Redacted diagnostic token.

Example:

```text
APFS-E-CHECKSUM-MISMATCH
Cannot mount this volume because metadata checksum validation failed.
Safety class: corruption-refusal
Allowed actions: inspect, diagnostics export --redacted
Refused actions: extract, mount, write
```

## Windows MVP UX

Examples:

```powershell
apfs inspect .\mac.apfs
apfs compatibility-report .\mac.apfs
apfs volumes .\mac.apfs
apfs mount .\mac.apfs X: --readonly
apfs extract '.\mac.apfs:/Data/Users/Dylan/Documents' .\Documents
```

Raw device examples:

```powershell
apfs inspect \\.\PhysicalDrive3
apfs volumes \\.\PhysicalDrive3
apfs mount \\.\PhysicalDrive3 X: --readonly --volume "Data"
```

Rules:

- If multiple volumes exist, ask for `--volume` by name or UUID.
- If source is encrypted and unsupported, show metadata only.
- If permissions are insufficient, explain Windows administrator/read permission requirements.
- If WinFsp is missing, explain install/runtime requirement.
- Mount is always read-only in MVP, regardless of source permissions.

## Diagnostic bundle

`apfs diagnostics export --redacted` may include:

- APFS feature flags.
- Volume UUIDs and roles.
- Object counts and type summaries.
- Error codes.
- Platform/version information.
- Redacted path samples.

It must not include:

- File contents.
- Passwords.
- Recovery keys.
- Derived keys.
- Personal full directory trees unless user explicitly requests and confirms.
- Raw metadata blocks that may contain personal file names unless redaction mode is disabled explicitly.

## JSON schema policy

- Every command with `--json` must include `schema_version`.
- Breaking JSON changes require release notes.
- Stable fields should not be removed within a stable release channel.
- Agent workflows should prefer JSON over human-readable output.

## Usability acceptance tests

- A new Windows user can inspect, list, mount read-only, and extract a simple image from docs alone.
- Unsupported states produce actionable errors.
- `compatibility-report --json` can drive GUI or agent workflows.
- Write-related commands are absent or lab-namespaced until write lab.
- Help text includes non-goals and safety warnings.

## Non-goals for MVP UX

- GUI app.
- Background service.
- Automatic repair.
- Automatic write enablement.
- Silent fallbacks for unsupported features.
