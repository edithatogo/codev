# ADR-0003: Agent Instructions Strategy

Status: Proposed  
Date: 2026-06-23  
Document version: 0.2.0

## Context

APFS-RS should be friendly to coding agents while remaining safe. Agent-readable instructions need to be predictable, path-specific where useful, and enforceable through CI when possible.

The current Codev repository already has its own root `AGENTS.md`/`CLAUDE.md` invariants, so APFS-RS agent instructions are stored as templates inside the APFS context pack until a dedicated implementation repository exists.

## Decision

For the future `apfs-rs` implementation repository:

1. Add root `AGENTS.md`.
2. Add root `CLAUDE.md` mirroring the same operational safety content where useful.
3. Add `.github/copilot-instructions.md` pointing to root agent rules.
4. Add path-specific `.github/instructions/*.md` for core, Windows, write safety, and security-sensitive code.
5. Keep machine-readable registries as the source for capability/safety/test mapping.
6. Add CI checks that enforce key rules instead of relying only on prose instructions.

## Consequences

- Agents have a short always-on rule set.
- Path-specific files reduce context overload.
- Future Copilot/Codex/Claude-style workflows can use the same source-of-truth rules.
- CI still needs to enforce safety because instruction files are guidance, not a security boundary.

## Alternatives considered

1. Put all agent context in README — rejected because it is noisy for humans and less discoverable for agents.
2. Tool-specific instructions only — rejected because the project should be agent-portable.
3. Live-edit Codev root `AGENTS.md` — rejected because it belongs to the Codev repo itself and has existing invariants.

## Review date

Revisit when the dedicated implementation repository is created.
