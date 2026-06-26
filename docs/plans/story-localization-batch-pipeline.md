# Story Localization Batch Pipeline Plan

## Goal

Extend the existing `@mediaforge/story-localization` pipeline so production text preparation uses the OpenAI Batch API by default, persists batch lifecycle state locally, supports restart-safe import and retry workflows, keeps runtime prompts compact, preserves the hard maximum of three main characters, and leaves actual image generation on demand.

## Current Baseline

- `packages/story-localization` already handles:
  - canonical English full-story discovery;
  - tolerant source parsing;
  - canonical fact extraction and caching;
  - synchronous structured OpenAI Responses API calls;
  - JSON schema validation;
  - one repair pass;
  - localized Markdown rendering;
  - cache manifests under `.localization-cache`;
  - CLI integration via `apps/cli/src/story-localization-commands.ts`.
- `packages/dark-truth` and `packages/image-generation` already contain:
  - recurring character state via `characters.json`;
  - image prompt batching concepts;
  - episode workspace conventions that can be reused.
- There is no OpenAI Batch API implementation for story localization yet.
- Current prompt construction still sends full Markdown content (`sourceStory.content`) instead of a compact DTO.

## Constraints

- Canonical source remains English `*-en-full.md` only.
- Batch mode becomes the default production mode.
- Synchronous mode remains available and explicit.
- No silent fallback from batch to sync.
- Batch state must survive CLI restarts and machine restarts.
- Local batch index and per-batch manifests must be atomic and repairable.
- Batch items stay independent per episode / operation / language.
- Actual image generation stays separate from text preparation.
- Production code must reuse existing logger, cache, parsing, rendering, and CLI patterns where possible.

## Phases

### Phase 1: Data Model and Planning Foundation

Tasks:

- Extend story-localization types with:
  - `ProcessingMode`;
  - `BatchOperation`;
  - compact source DTOs;
  - batch item, manifest, index, retry, import, and report types.
- Add Zod schemas for:
  - batch manifests;
  - batch index entries;
  - compact source payloads;
  - localized production templates;
  - English-short and localization batch result envelopes.
- Introduce default constants for source/output directories and short word ranges in one shared place.

Dependencies:

- Existing `story-localization.types.ts`
- Existing `story-localization.schemas.ts`

Affected files:

- `packages/story-localization/src/story-localization.types.ts`
- `packages/story-localization/src/story-localization.schemas.ts`
- `packages/story-localization/src/language-profiles.ts`

Risks:

- Type churn across service, validator, renderer, and CLI code.

Validation:

- Strict typecheck passes with no `any`.
- Unit coverage for new schemas and constants.

### Phase 2: Compact Parsing and Prompt Refactor

Tasks:

- Refactor source parsing to emit a compact `ParsedEnglishStory` shape:
  - narration only;
  - compact metadata fields;
  - no repeated Markdown boilerplate in runtime prompts.
- Refactor canonical fact extraction to keep concise values.
- Introduce local deterministic templates for repeated localized boilerplate.
- Update prompt building to send only:
  - narration;
  - compact metadata;
  - compact canonical facts;
  - operation-specific instructions.

Dependencies:

- Phase 1 types and schemas

Affected files:

- `packages/story-localization/src/source-story-parser.ts`
- `packages/story-localization/src/canonical-facts.service.ts`
- `packages/story-localization/src/localization-prompt-builder.ts`
- `packages/story-localization/src/story-markdown-renderer.ts`

Risks:

- Over-compressing prompts and losing preservation cues.

Validation:

- Parser tests for required headings, narration extraction, and source rejection.
- Prompt-builder tests asserting compact DTO usage and absence of full Markdown wrappers except where explicitly required for batch payload bodies.

### Phase 3: Batch Storage, Manifest, and Index Services

Tasks:

- Create `.batch` storage service under the localization output root.
- Implement:
  - batch directory resolver;
  - local batch ID creation;
  - deterministic `custom_id` generation;
  - manifest persistence;
  - central batch index service;
  - atomic locking for the index;
  - rebuild and verify workflows.
- Persist lifecycle artifacts under:
  - `inputs/`
  - `manifests/`
  - `results/`
  - `errors/`
  - `reports/`
  - `locks/`

Dependencies:

- Phase 1 types and schemas
- Existing atomic JSON/file helpers in `@mediaforge/shared`

Affected files:

- New files under `packages/story-localization/src/`:
  - `story-localization-batch.types.ts` or folded into existing types
  - `story-localization-batch.schemas.ts` or folded into existing schemas
  - `story-localization-batch-storage.ts`
  - `story-localization-batch-index.ts`
  - `story-localization-batch-lock.ts`
- Existing:
  - `packages/story-localization/src/story-localization-cache.ts`
  - `packages/story-localization/src/story-localization.utils.ts`

Risks:

- Index/manifest drift after partial failures.
- Locking edge cases on interrupted runs.

Validation:

- Unit tests for atomic writes, lock behavior, index invariants, rebuild, and manifest/index reconciliation.

### Phase 4: OpenAI Batch API Client Integration

Tasks:

- Extend the existing OpenAI client abstraction to support:
  - file upload for JSONL input;
  - batch creation;
  - batch retrieval and refresh;
  - output/error file download;
  - imported-result parsing.
- Keep sync and batch clients behind one story-localization service boundary.
- Use batch mode by default and sync only when explicitly selected.
- Add `--fallback-to-sync` handling without silent fallback.

Dependencies:

- Phase 3 batch storage/index services

Affected files:

- `packages/story-localization/src/story-localization.service.ts`
- New helper file such as:
  - `packages/story-localization/src/story-localization-openai-batch.ts`

Risks:

- SDK surface mismatch with installed OpenAI version.
- Result-file parsing differences from normal Responses API calls.

Validation:

- Mocked integration tests for:
  - batch request serialization;
  - batch submission;
  - refresh lifecycle transitions;
  - output/error import;
  - explicit sync fallback.

### Phase 5: Batch-Oriented Story Pipeline Orchestration

Tasks:

- Split current monolithic episode processing into:
  - source preparation;
  - batch item planning;
  - batch submission;
  - batch refresh/import;
  - per-item validation and persistence;
  - retry batch planning for failed items;
  - targeted repair flow.
- Keep independence per:
  - English short;
  - each localization language;
  - future canonical-facts / character / visual operations.
- Preserve current synchronous path for development/debugging.

Dependencies:

- Phases 2-4

Affected files:

- `packages/story-localization/src/story-localization.service.ts`
- `packages/story-localization/src/generated-story-validator.ts`
- `packages/story-localization/src/story-localization.cost-tracker.ts`
- `packages/story-localization/src/story-localization.errors.ts`

Risks:

- Regression in current sync workflow.
- Incomplete reporting for partially completed episodes.

Validation:

- Integration tests for:
  - partial language failure;
  - retry child batch creation;
  - imported-with-failures states;
  - cache reuse;
  - source hash invalidation;
  - validate-only making no API calls.

### Phase 6: Character / Visual Text-Preparation Integration

Tasks:

- Reuse existing episode character conventions and enforce maximum three main characters.
- Add batch operations for:
  - character analysis;
  - visual analysis;
  - thumbnail concept generation;
  - localized thumbnail prompt variants.
- Persist only text-preparation outputs and metadata in this task.
- Keep actual image generation separate and opt-in.

Dependencies:

- Phase 5 orchestration
- Existing `packages/dark-truth` and `packages/image-generation` conventions

Affected files:

- `packages/story-localization/src/story-localization.service.ts`
- likely new helper modules for character/visual planning
- possible reuse touchpoints in:
  - `packages/dark-truth/src/index.ts`
  - `packages/image-generation/src/episode-image-pipeline.ts`

Risks:

- Duplicating character state already managed elsewhere.
- Blurring text-preparation outputs with image-generation side effects.

Validation:

- Tests ensuring:
  - max three characters;
  - canonical character extraction never uses translated inputs;
  - image generation is never triggered by default.

### Phase 7: CLI Expansion and Operator Workflows

Tasks:

- Expand the stories CLI to support:
  - `stories:localize` batch/sync mode selection;
  - batch list/find/status/import/refresh/retry/repair;
  - batch index rebuild/verify;
  - validate-only and dry-run across batch-aware flows.
- Ensure CLI output includes:
  - local batch IDs;
  - remote batch IDs;
  - import status;
  - persisted counts;
  - retryability.

Dependencies:

- Phases 3-5

Affected files:

- `apps/cli/src/story-localization-commands.ts`
- `apps/cli/src/index.ts`
- `package.json`
- `docs/cli.md`

Risks:

- Too much logic inside CLI handlers instead of services.

Validation:

- CLI unit/integration tests for:
  - dry run;
  - batch preparation;
  - import after restart;
  - retry creation;
  - rebuild-index.

### Phase 8: Documentation and End-to-End Validation

Tasks:

- Document:
  - batch storage layout;
  - operational lifecycle;
  - restart-safe import flow;
  - sync vs batch tradeoffs;
  - fallback-to-sync behavior;
  - troubleshooting and recovery commands.
- Run:
  - formatting;
  - targeted linting;
  - strict typecheck;
  - unit tests;
  - integration tests.

Dependencies:

- All implementation phases

Affected files:

- `docs/cli.md`
- `docs/dark-truth-multilingual-production.md`
- optional new batch-specific documentation

Risks:

- Documentation drifting from actual CLI flags and file layout.

Validation:

- Commands in docs match implemented CLI behavior.

## Cross-Cutting Decisions

- Manifest is authoritative; index is a lookup accelerator.
- Results import must be idempotent.
- No silent sync fallback.
- Batch items stay granular per episode / language / operation.
- Retry creates a child batch entry instead of mutating historical entries.
- Repeated boilerplate is rendered locally, not spent through the model.

## High-Risk Areas

- OpenAI Batch SDK compatibility with the installed Node client.
- Index locking and recovery under interrupted writes.
- Maintaining sync compatibility while introducing batch as the default mode.
- Preserving validation strictness when importing batch results that arrive long after submission.
- Preventing drift between story-localization output state and existing character/image pipeline state.

## Validation Matrix

- Unit:
  - filename/source discovery
  - compact parsing
  - canonical fact extraction
  - custom ID determinism
  - batch manifest schema
  - batch index filtering
  - lock handling
  - retry classification
  - repair limits
- Integration:
  - batch preparation without submission
  - batch submission and refresh with mocked client
  - completed batch import
  - partial failures and retry child batches
  - rebuild-index from manifests
  - sync mode path
  - explicit fallback-to-sync path
  - restart-safe import after persisted state reload
- CLI:
  - dry-run
  - validate-only
  - batch list/find/import/retry/rebuild-index

## Initial Execution Order

1. Extend types/schemas and compact DTOs.
2. Refactor parsing/prompt building to compact runtime inputs.
3. Build batch storage + manifest + index + lock services.
4. Add OpenAI Batch client support.
5. Refactor orchestration to support prepare/submit/refresh/import/retry.
6. Integrate character and visual text-preparation outputs.
7. Expand CLI and docs.
8. Run tests, typecheck, lint, and fix regressions.
