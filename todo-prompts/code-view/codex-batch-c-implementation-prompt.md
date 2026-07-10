# Codex Implementation Prompt: Batch C — Pipeline Contracts, Asset Identity, Provider Boundary

## Model / Mode

Use GPT-5.5 with reasoning set to High.

Implement the plan in:

`docs/reports/codex-runs/2026-07-08-batch-c-implementation-plan.md`

This implementation covers only:

- Task 05: Pipeline Stage Contracts
- Task 06: Localization Asset Identity
- Task 07: Batch Image Provider Boundary

Do not implement Tasks 08, 09, 10, or 11.

## Core Constraints

Keep this batch incremental.

Do not rewrite the whole CLI, story pipeline, image pipeline, rendering pipeline, upload pipeline, or remote-rendering pipeline.

Preserve:

- `stories pipeline` dry-run behavior
- fake-provider test paths
- existing public CLI entrypoints where practical
- existing unsupported edit-batch behavior
- existing unrelated dirty-tree files

Do not run or introduce:

- live OpenAI calls
- YouTube calls
- remote render calls
- SSH or rsync calls
- generated-media edits
- fixture regeneration
- snapshot updates
- broad builds
- broad tests
- broad typechecks

Do not create a commit unless explicitly requested.

## Before Editing

First inspect the implementation plan and relevant source files.

Then write a short implementation outline in the terminal/session notes before modifying files:

1. Which files will be touched for Task 05.
2. Which files will be touched for Task 06.
3. Which files will be touched for Task 07.
4. Which files are likely to overlap between Task 06 and Task 07.
5. Which verification commands will be attempted.

Stop and report if the implementation requires touching unrelated dirty files or expanding beyond this plan.

## Required Implementation Order

Implement strictly in this order:

1. Task 05 — Pipeline Stage Contracts
2. Task 06 — Localization Asset Identity
3. Task 07 — Batch Image Provider Boundary
4. Focused verification
5. Required implementation report

Do not casually interleave Task 06 and Task 07. They may overlap around image batch identity, schemas, normalization, and planner behavior. If a compile/test failure requires coordinated changes, make the smallest possible coordinated change and document it in the final report.

---

# Task 05: Pipeline Stage Contracts

## Goal

Add a safer contract layer for the first executable story workflow boundary while keeping `stories pipeline` dry-run in this batch.

## Requirements

Add typed stage contract fields to story workflow manifests:

- stage inputs
- stage outputs
- dependency fingerprints
- contract fingerprint
- marker for legacy synthetic fingerprints

Add outcome kinds alongside existing manifest status values:

- `planned`
- `skipped`
- `cache-hit`
- `started`
- `completed`
- `failed-retryable`
- `failed-terminal`

Store retryability and failure classification on persisted workflow outcomes and status summaries.

Replace synthetic fingerprints for the first executable boundary where data is available:

- `ingest-source:en:full`

This fingerprint should derive from:

- `resolveAuthoredScript` content hash
- cache identity
- resolver version
- locale
- variant
- workflow schema version

Derive downstream parent fingerprints from dependency contract fingerprints instead of ad hoc stage strings where planner dependency data already exists.

Add an async workspace-aware planning path for real input fingerprints while preserving sync planner compatibility for existing unit tests.

Make resume/status compare saved contract fingerprints with current authored-script hashes and report stale stages without mutating manifests during read-only status commands.

Keep CLI registration thin. `apps/cli/src/story-pipeline-command.ts` may delegate to story workflow planner/store/status helpers. Avoid broad edits to `apps/cli/src/index.ts`.

## Likely Files

Inspect and edit only where needed:

- `packages/story-localization/src/story-workflow.types.ts`
- `packages/story-localization/src/story-workflow.schemas.ts`
- `packages/story-localization/src/story-workflow-planner.ts`
- `packages/story-localization/src/story-workflow-store.ts`
- `packages/story-localization/src/story-workflow-invalidation.ts`
- `packages/story-localization/src/story-workflow-status.ts`
- `apps/cli/src/story-pipeline-command.ts`
- `apps/cli/src/story-pipeline-status-output.ts`

---

# Task 06: Localization Asset Identity

## Goal

Make localized/full/short image identity stable and explicit without breaking old manifest reads silently.

## Requirements

Emit new image asset identity fields for newly planned image batches:

- episode slug
- language
- variant
- aspect ratio
- story beat ID
- optional shot ID
- visual intent hash
- prompt hash
- dependency/source hash
- source language
- target language
- asset purpose

Prefer an explicit identity version bump or schema-compatible extension.

Preserve old cache/manifest reads only through named compatibility normalization. Do not silently treat v1 and v2 identity as equivalent.

Update short shared portrait aliasing so same output path aliases only when all relevant identity dimensions match:

- visual intent
- prompt hash
- dependency/source hash
- subject
- asset purpose
- aspect ratio
- configuration identity

If localized short visual intent differs for the same subject/output path, reject with:

- `duplicate-destination-path`

or an equivalent explicit planner error.

Centralize supported locale handling around the shared registry:

- `en`
- `de`
- `es`
- `fr`
- `pt`

Keep legacy `sp` rejected with the existing Spanish guidance.

Expand Dark Truth boundary support for `pt` only as needed for locale validation and source discovery. Do not rewrite language-specific parsing beyond Portuguese heading aliases or explicit unsupported-locale errors.

## Likely Files

Inspect and edit only where needed:

- `packages/image-generation/src/image-batch-identity.ts`
- `packages/image-generation/src/image-batch.types.ts`
- `packages/image-generation/src/image-batch.schemas.ts`
- `packages/image-generation/src/image-batch-normalization.ts`
- `packages/image-generation/src/image-batch-planner.ts`
- `packages/domain/src/shared-visuals.unit.test.ts`
- `packages/dark-truth/src/index.ts`

---

# Task 07: Batch Image Provider Boundary

## Goal

Separate OpenAI batch mechanics from image orchestration and normalize provider verification while preserving current public service functions.

## Requirements

Introduce an `ImageBatchProvider` interface covering:

- upload input file
- create batch
- retrieve status
- download output files
- download error files
- provider status/error normalization

Move OpenAI-specific mechanics into an OpenAI adapter:

- OpenAI file IDs
- OpenAI batch IDs
- status mapping
- batch creation
- file downloads

Add branded IDs where useful:

- `OpenAiBatchId`
- `OpenAiFileId`

Keep image orchestration in `image-batch-service.ts`:

- storage
- manifest state transitions
- import classification
- retry planning
- alias follower propagation

Keep public service functions source-compatible where practical:

- `submitImageBatch`
- `refreshImageBatch`
- `importImageBatch`

Existing CLI commands should still call those service functions. Delegate OpenAI client wrapping internally or through a small adapter factory.

Extract strict image payload validation shared by direct image generation and batch import:

- base64 normalization
- non-empty byte payload
- MIME validation
- byte-size metadata
- requested dimension checks

Keep reference-assisted edit batches blocked through the existing:

- `unsupported-edit-batch-request`

Do not enable live `/v1/images/edits` batch submission without explicit paid provider verification approval.

## Likely Files

Inspect and edit only where needed:

- `packages/image-generation/src/image-batch-provider.ts`
- `packages/image-generation/src/openai-image-batch-provider.ts`
- `packages/image-generation/src/image-payload-validation.ts`
- `packages/image-generation/src/image-batch-service.ts`
- `packages/image-generation/src/openai-image.ts`
- `apps/cli/src/images-batch-commands.ts`

---

# Verification

Stay within one implementation-context budget.

Prefer grouped focused commands so the wrapper still receives explicit files and no broad test entrypoint is used.

Run:

```bash
pnpm test:focused -- packages/story-localization/src/story-workflow.schemas.unit.test.ts packages/story-localization/src/story-workflow-store.unit.test.ts apps/cli/src/story-pipeline-command.unit.test.ts
pnpm test:focused -- packages/image-generation/src/image-batch-planner.unit.test.ts packages/domain/src/shared-visuals.unit.test.ts
pnpm test:focused -- packages/image-generation/src/image-batch-service.unit.test.ts packages/image-generation/src/openai-image.unit.test.ts
pnpm --filter @mediaforge/image-generation typecheck
```

If grouped `test:focused` behavior is not accepted by the wrapper, run the directly affected file first for the active task and stop before exceeding three distinct test commands.

Do not run:

- broad build
- broad test
- broad typecheck
- snapshot updates
- fixture regeneration
- provider calls
- upload commands
- remote commands

## Required Report

After implementation, create or update:

`docs/reports/2026-07-08/code-review-follow-up-batch-c-implementation-report.md`

The report must include:

- source task files
- implementation summary
- changed files
- tests/checks run
- test/check results
- incomplete items
- deviations from the plan
- remaining risks
- next recommended batch

Explicitly state that full story workflow orchestration beyond the first executable source boundary remains unfinished in this batch if that remains true.

## Final Response Required

When finished, provide:

1. Summary of what changed.
2. Changed files.
3. Verification commands run and results.
4. Any commands intentionally skipped.
5. Remaining risks.
6. Whether Batch D can start next.
