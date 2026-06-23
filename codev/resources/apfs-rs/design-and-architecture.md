# APFS-RS Design and Architecture

Document version: 0.1.0  
Status: Draft  
Date: 2026-06-23  
Codev phase: Specify/Plan resource

## Design goals

1. **Clean-room Rust core** — all APFS logic lives in shared, platform-neutral crates.
2. **Windows-first delivery** — ship read-only inspection, extraction, and mount before cross-platform expansion.
3. **User-mode filesystem adapters** — avoid custom kernel filesystem drivers unless a later governance decision proves they are necessary.
4. **Read-only by default** — write support is gated behind image-only lab validation first.
5. **Safety as architecture** — unsupported states are explicit typed errors, not best-effort fallthroughs.
6. **CI/CD-first engineering** — every crate, feature, and platform adapter must be testable in GitHub automation.
7. **Codev traceability** — every capability follows issue → spec → plan → PR → review.

## High-level system context

```mermaid
flowchart TB
    User[User / Administrator]
    CLI[apfs CLI]
    Explorer[Windows Explorer / PowerShell]
    Apps[Other OS apps]

    WinMount[apfs-win WinFsp Adapter]
    FuseMount[apfs-fuse Adapter]
    Android[apfs-android Access Layer]
    VFS[apfs-vfs Platform-neutral Filesystem API]
    Read[apfs-read]
    Core[apfs-core]
    Types[apfs-types]
    Block[apfs-blockdev]
    Compress[apfs-compress]
    Crypto[apfs-crypto]
    Write[apfs-write Lab-gated]

    Images[Disk Images / DMG Adapter]
    Raw[Raw Block Devices]
    Fixtures[Generated Test Fixtures]

    User --> CLI
    Explorer --> WinMount
    Apps --> FuseMount
    Apps --> Android
    CLI --> VFS
    WinMount --> VFS
    FuseMount --> VFS
    Android --> VFS
    VFS --> Read
    VFS --> Write
    Read --> Core
    Write --> Core
    Core --> Types
    Core --> Block
    Read --> Compress
    Read --> Crypto
    Block --> Images
    Block --> Raw
    Block --> Fixtures
```

## Rust workspace target

```text
crates/
├── apfs-types       # endian-safe APFS structs, object IDs, feature flags, checksums
├── apfs-blockdev    # block-device abstraction over images, partitions, raw devices, fixtures
├── apfs-core        # container, checkpoints, object map, B-trees, spaceman read model
├── apfs-read        # directory traversal, file extents, metadata, snapshots, xattrs
├── apfs-compress    # ZLIB, LZVN, LZFSE, and compression dispatch
├── apfs-crypto      # software-encryption read support, key handling, zeroisation
├── apfs-write       # copy-on-write transaction builder; disabled outside lab initially
├── apfs-vfs         # platform-neutral filesystem operations
├── apfs-win         # Windows WinFsp adapter; Dokany optional later
├── apfs-fuse        # Linux/macOS/ChromeOS FUSE-compatible adapter
├── apfs-android     # Android library/app integration layer
├── apfs-cli         # inspect, volumes, ls, cat, extract, mount, verify-read, dump-tree
└── apfs-test        # fixture generation, manifests, differential verifier, crash testing
```

## Crate dependency direction

```mermaid
graph LR
    Types[apfs-types] --> Core[apfs-core]
    Block[apfs-blockdev] --> Core
    Core --> Read[apfs-read]
    Compress[apfs-compress] --> Read
    Crypto[apfs-crypto] --> Read
    Core --> Write[apfs-write]
    Read --> VFS[apfs-vfs]
    Write --> VFS
    VFS --> CLI[apfs-cli]
    VFS --> Win[apfs-win]
    VFS --> Fuse[apfs-fuse]
    VFS --> Android[apfs-android]
    Test[apfs-test] --> Types
    Test --> Block
    Test --> Core
    Test --> Read
    Test --> Write
```

Dependency rule: arrows point toward crates that may depend on the source. Platform crates must not be dependencies of core crates.

## Read-only data path

```mermaid
sequenceDiagram
    participant U as User/OS
    participant A as Adapter or CLI
    participant V as apfs-vfs
    participant R as apfs-read
    participant C as apfs-core
    participant B as apfs-blockdev
    participant D as Disk/Image

    U->>A: open/list/read path
    A->>V: lookup/read request
    V->>R: resolve path and operation
    R->>C: load volume tree / extents
    C->>B: read blocks by physical address
    B->>D: read-only block read
    D-->>B: block bytes
    B-->>C: validated bytes
    C-->>R: APFS objects and extents
    R-->>V: file metadata or data stream
    V-->>A: normalized VFS result
    A-->>U: directory entries or file bytes
```

Read-path invariants:

- All block reads are bounds-checked.
- Metadata checksums and object headers are validated where applicable.
- Tree traversal has depth, cycle, and range guards.
- Unsupported compression/encryption returns a typed unsupported error.
- Extraction never writes outside the destination directory.
- Windows mount mode exposes read-only semantics regardless of source permissions.

## Windows mount architecture

```mermaid
flowchart LR
    Explorer[Explorer / PowerShell / Win32 API]
    WinFsp[WinFsp Runtime]
    Adapter[apfs-win]
    VFS[apfs-vfs]
    Core[APFS Core]
    Source[Disk image or external APFS device]

    Explorer --> WinFsp
    WinFsp --> Adapter
    Adapter --> VFS
    VFS --> Core
    Core --> Source

    Adapter -. maps .-> Metadata[APFS metadata to Windows attributes]
    Adapter -. enforces .-> ReadOnly[Read-only behaviour]
    Adapter -. reports .-> Diagnostics[Structured diagnostics]
```

Windows design rules:

- Prefer WinFsp as the first bridge because it supports user-mode Windows filesystems and avoids writing a custom kernel filesystem driver.
- Keep Dokany as a possible secondary adapter, not a first dependency.
- Treat Windows path normalisation and case handling as a dedicated design area.
- Return conservative file attributes and avoid claiming unsupported ACL semantics.
- Mount read-only until the write lab and beta gates are passed.

## Object model

```mermaid
classDiagram
    class BlockDevice {
      +read_at(offset, len) Result<Bytes>
      +size() u64
      +sector_size() u32
      +capabilities() DeviceCaps
    }

    class ApfsContainer {
      +block_size
      +features
      +checkpoints
      +selected_checkpoint
    }

    class ObjectMap {
      +lookup(oid, xid) PhysicalAddress
    }

    class ApfsVolume {
      +uuid
      +name
      +role
      +encrypted
      +features
    }

    class FsTree {
      +lookup(path) Node
      +readdir(node) Entry[]
      +extents(file) Extent[]
    }

    class VfsNode {
      +inode
      +kind
      +size
      +timestamps
      +flags
    }

    BlockDevice <|-- ImageDevice
    BlockDevice <|-- RawReadOnlyDevice
    ApfsContainer --> BlockDevice
    ApfsContainer --> ObjectMap
    ApfsContainer --> ApfsVolume
    ApfsVolume --> FsTree
    FsTree --> VfsNode
```

## Write transaction model

Write support must not be a direct mutation API. It should be a staged transaction plan that can be inspected, tested, and interrupted.

```mermaid
stateDiagram-v2
    [*] --> Disabled
    Disabled --> LabOnly: build with lab feature
    LabOnly --> Preflight: open disposable image
    Preflight --> Plan: verify supported features
    Plan --> Allocate: choose new object blocks
    Allocate --> WriteObjects: write copy-on-write objects
    WriteObjects --> UpdateObjectMap: stage OMAP updates
    UpdateObjectMap --> WriteCheckpoint: write new checkpoint
    WriteCheckpoint --> Verify: remount and check invariants
    Verify --> Committed: valid new state
    Verify --> RolledBack: old checkpoint remains valid
    Committed --> [*]
    RolledBack --> [*]
```

Write invariants:

- Never overwrite live metadata in place.
- A crash must leave either the old checkpoint or the new checkpoint valid.
- Every write sub-step must be failure-injectable in tests.
- Physical-device write mode requires a later beta gate, exclusive lock, and preflight verifier.

## Error taxonomy

```mermaid
flowchart TB
    Error[apfs::Error]
    Io[Io]
    Format[Format]
    Checksum[Checksum]
    Unsupported[Unsupported]
    Safety[SafetyRefusal]
    Crypto[CryptoState]
    Platform[PlatformAdapter]
    Bug[InternalInvariant]

    Error --> Io
    Error --> Format
    Error --> Checksum
    Error --> Unsupported
    Error --> Safety
    Error --> Crypto
    Error --> Platform
    Error --> Bug
```

Typed error principles:

- Corrupt input is not an internal bug.
- Unsupported APFS features are not a panic.
- Internal invariant errors are bugs and should include safe diagnostic context.
- Security-sensitive context must be redacted.

## CI/CD architecture

```mermaid
flowchart LR
    PR[Pull Request]
    Docs[Docs / Markdown lint]
    RustFmt[cargo fmt]
    Clippy[cargo clippy strict]
    Test[cargo test / nextest]
    Deny[cargo deny / audit / vet]
    Fuzz[Fuzz smoke]
    Coverage[llvm-cov]
    CodeScan[CodeQL / SARIF]
    Win[Windows mount smoke]
    Review[Required review]
    Merge[Merge]

    PR --> Docs
    PR --> RustFmt
    PR --> Clippy
    PR --> Test
    PR --> Deny
    PR --> Fuzz
    PR --> Coverage
    PR --> CodeScan
    PR --> Win
    Docs --> Review
    RustFmt --> Review
    Clippy --> Review
    Test --> Review
    Deny --> Review
    Fuzz --> Review
    Coverage --> Review
    CodeScan --> Review
    Win --> Review
    Review --> Merge
```

## GitHub automation design

Minimum workflows for the implementation repo:

| Workflow | Trigger | Purpose |
|---|---|---|
| `ci.yml` | PR, push | Format, clippy, tests, docs, MSRV. |
| `platform.yml` | PR, push | Windows/Linux/macOS matrix build; Windows read-only mount smoke where possible. |
| `security.yml` | PR, schedule | audit, deny, vet, CodeQL/SARIF, secret scan expectations. |
| `fuzz.yml` | schedule, manual | Long-running fuzz jobs and corpus minimisation artifacts. |
| `fixtures.yml` | manual, protected | Generate fixture manifests on controlled macOS runner. |
| `release.yml` | tag | Build signed binaries, checksums, SBOM, provenance attestations. |
| `docs.yml` | PR, push | Render docs, Mermaid diagrams, mdbook if adopted. |

## Development approach

### Vertical slices

Implement capability slices that go end-to-end through CLI and tests instead of building all parsers first.

Example first slices:

1. Identify APFS image and print container metadata.
2. Select checkpoint and print object map summary.
3. List volumes.
4. List root directory.
5. Extract one regular file.
6. Mount one read-only Windows image.

### Test-first fixtures

Each APFS feature should start with fixture definition:

- How the fixture is generated.
- macOS commands used to create it.
- Expected tree manifest.
- Expected hashes.
- Unsupported feature expectation if not yet implemented.

### Differential testing

For any read/write feature:

- Generate disposable image on macOS.
- Query using macOS native tools.
- Query using `apfs-rs`.
- Compare tree, metadata, and hashes.
- Store only safe fixture artifacts and manifests in the repository.

### Agent-safe Codev use

- Builders work in isolated branches/worktrees.
- Builders use image fixtures only.
- No builder receives device-write permissions.
- Plans must identify safety gates before implementation.
- Reviews must update capability and compatibility files.

## Open design questions

1. Which WinFsp Rust binding approach is safest: direct `windows`/FFI binding, generated bindgen, or a small C shim?
2. Which parser style should dominate: manual endian-safe readers, `zerocopy`, `winnow`, or a combination?
3. Which LZVN implementation is safest and licence-compatible?
4. Should the project publish a separate read-only forensic mode with different error-tolerance semantics?
5. What fixture corpus can be legally distributed, and what must be generated locally?
6. Which Windows packaging route is preferred: MSI, winget, Chocolatey, or all three?
