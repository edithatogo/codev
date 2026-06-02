# spir-778 — Gemini CLI → Antigravity CLI migration

## Context
Issue #778: Gemini CLI is being retired **June 18, 2026** (today is 2026-06-01 — 17 days out).
Google blog: transition Gemini CLI → Antigravity CLI. Codev uses `gemini` as a consult backend.

## Research findings (Specify phase)
- **What breaks June 18**: subscription/OAuth serving via the Gemini CLI & Code Assist for
  Google AI Pro / Ultra / free-individual tiers. Enterprise (Standard/Enterprise licenses,
  Google Cloud) unaffected.
- **What survives**: the Gemini **Developer API** (GEMINI_API_KEY, Google AI Studio) and Vertex AI.
  The API is NOT deprecated. (Wrinkle: from June 19, unrestricted API keys are blocked — keys must
  be scoped to the Generative Language API.)
- **Antigravity CLI (`agy`)**: Go-based, agentic, async, multi-agent. NOT a clean drop-in for
  Codev's one-shot `gemini --output-format json --model X` pattern. Headless/JSON support
  unconfirmed; not on any public package manager as of late May 2026. Migration guide page
  (antigravity.google/docs/gcli-migration) had no extractable technical detail yet.

## Codev's Gemini surface area (ground truth)
- `packages/codev/src/commands/consult/index.ts:37-40` — MODEL_CONFIGS.gemini =
  `{ cli: 'gemini', args: ['--model','gemini-3.1-pro-preview'], envVar: 'GEMINI_SYSTEM_MD' }`;
  spawn at ~682 with `--output-format json`, prompt via stdin, NODE_OPTIONS heap bump (#680).
- `packages/codev/src/lib/config.ts:88` — default consult models `['gemini','codex','claude']`.
- `packages/codev/src/commands/consult/usage-extractor.ts:19` — pricing key `gemini-3.1-pro`.
- `packages/codev/src/commands/doctor.ts:153-163` (dep check) + `266-274` (auth via `gemini --yolo`).
- `codev-skeleton/protocol-schema.json:155` model enum; `porch/next.ts:51` VALID_MODELS.
- 7 skeleton protocol JSONs reference "gemini"; docs (CLAUDE/AGENTS/README/consult skill).
- ~60 tests across consult/doctor/config/porch.

## Key decision (for spec-approval gate)
Three migration strategies explored in spec. Leaning: **pivot gemini lane → Gemini Developer API**
(robust, deadline-safe, API not retiring) **with graceful degradation** (claude+codex) when no key.
Antigravity-CLI adoption is risky right now (agentic mismatch, unconfirmed headless, not packaged).
The issue *title* literally says "Gemini CLI > Antigravity CLI" — flagging the divergence to the
architect since my research says the literal Antigravity path is the higher-risk one.

## Status
- [x] Specify: research + ground-truth map done
- [ ] Specify: spec drafted → `porch done` → 3-way consult → spec-approval gate (HUMAN)
