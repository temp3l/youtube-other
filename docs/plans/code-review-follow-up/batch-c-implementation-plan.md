# Batch C Implementation Plan: Pipeline Contracts, Asset Identity, Provider Boundary

Source tasks:

- `docs/plans/code-review-follow-up/tasks/task-05-pipeline-stage-contracts.md`
- `docs/plans/code-review-follow-up/tasks/task-06-localization-asset-identity.md`
- `docs/plans/code-review-follow-up/tasks/task-07-batch-image-provider-boundary.md`

## Summary

Implement Tasks 05, 06, and 07 only. Keep this batch incremental: do not rewrite the whole CLI, story pipeline, or image pipeline. Preserve dry-run and fake-provider test paths, avoid live OpenAI, YouTube, remote render, SSH, and generated-media edits, and do not touch unrelated dirty-tree files.

The target result is a safer contract layer for the first executable story workflow boundary, stable localized/full/short image identity, and an explicit OpenAI image batch adapter boundary.

## Task 05: Pipeline Stage Contracts

- Add typed stage contract fields to story workflow manifests: stage inputs, stage outputs, dependency fingerprints, contract fingerprint, and a clear marker for legacy synthetic fingerprints.
- Add outcome kinds alongside existing manifest status values: `planned`, `skipped`, `cache-hit`, `started`, `completed`, `failed-retryable`, and `failed-terminal`.
- Store retryability and failure classification on persisted workflow outcomes and status summaries.
- Replace synthetic fingerprints for the first executable boundary where data is available: `ingest-source:en:full` should derive from `resolveAuthoredScript` content hash, cache identity, resolver version, locale, variant, and workflow schema version.
- Derive downstream parent fingerprints from dependency contract fingerprints instead of ad hoc stage strings where the planner has dependency data.
- Keep `stories pipeline` dry-run in this batch. Add an async workspace-aware planning path for real input fingerprints, while preserving sync planner compatibility for existing unit tests.
- Make resume/status compare saved contract fingerprints with current authored-script hashes and report stale stages without mutating manifests during read-only status commands.
- Keep CLI registration thin. `apps/cli/src/story-pipeline-command.ts` should delegate to story workflow planner/store/status helpers; avoid broad edits to `apps/cli/src/index.ts`.

Likely touched files:

- `packages/story-localization/src/story-workflow.types.ts`
- `packages/story-localization/src/story-workflow.schemas.ts`
- `packages/story-localization/src/story-workflow-planner.ts`
- `packages/story-localization/src/story-workflow-store.ts`
- `packages/story-localization/src/story-workflow-invalidation.ts`
- `packages/story-localization/src/story-workflow-status.ts`
- `apps/cli/src/story-pipeline-command.ts`
- `apps/cli/src/story-pipeline-status-output.ts`

## Task 06: Localization Asset Identity

- Emit new image asset identity fields for newly planned image batches: episode slug, language, variant, aspect ratio, story beat ID, optional shot ID, visual intent hash, prompt hash, dependency/source hash, source language, target language, and asset purpose.
- Prefer an explicit identity version bump or schema-compatible extension. Preserve old cache/manifest reads only through named compatibility normalization, not by silently treating v1 and v2 identity as equivalent.
- Update short shared portrait aliasing so same output path aliases only when visual intent, prompt hash, dependency/source hash, subject, asset purpose, aspect ratio, and configuration identity match.
- If localized short visual intent differs for the same subject/output path, reject with `duplicate-destination-path` or an equivalent explicit planner error instead of aliasing.
- Centralize supported locale handling around the shared `en`, `de`, `es`, `fr`, `pt` registry. Keep legacy `sp` rejected with the existing Spanish guidance.
- Expand Dark Truth boundary support for `pt` only as needed for locale validation and source discovery. Do not rewrite language-specific parsing beyond Portuguese heading aliases or explicit unsupported-locale errors.

Likely touched files:

- `packages/image-generation/src/image-batch-identity.ts`
- `packages/image-generation/src/image-batch.types.ts`
- `packages/image-generation/src/image-batch.schemas.ts`
- `packages/image-generation/src/image-batch-normalization.ts`
- `packages/image-generation/src/image-batch-planner.ts`
- `packages/domain/src/shared-visuals.unit.test.ts`
- `packages/dark-truth/src/index.ts`

## Task 07: Batch Image Provider Boundary

- Introduce an `ImageBatchProvider` interface covering upload input file, create batch, retrieve status, download output/error files, and provider status/error normalization.
- Move OpenAI file IDs, batch IDs, status mapping, batch creation, and file downloads into an OpenAI adapter. Add branded IDs where useful: `OpenAiBatchId` and `OpenAiFileId`.
- Keep image orchestration in `image-batch-service.ts`: storage, manifest state transitions, import classification, retry planning, and alias follower propagation remain service concerns.
- Keep public service functions source-compatible where practical. Existing CLI commands should still call `submitImageBatch`, `refreshImageBatch`, and `importImageBatch`, with OpenAI client wrapping delegated internally or through a small adapter factory.
- Extract strict image payload validation shared by direct image generation and batch import: base64 normalization, non-empty byte payload, MIME validation, byte-size metadata, and requested dimension checks.
- Keep reference-assisted edit batches blocked through the existing `unsupported-edit-batch-request` behavior. Do not enable live `/v1/images/edits` batch submission without explicit paid provider verification approval.

Likely touched files:

- `packages/image-generation/src/image-batch-provider.ts`
- `packages/image-generation/src/openai-image-batch-provider.ts`
- `packages/image-generation/src/image-payload-validation.ts`
- `packages/image-generation/src/image-batch-service.ts`
- `packages/image-generation/src/openai-image.ts`
- `apps/cli/src/images-batch-commands.ts`

## Verification

Stay within one implementation-context budget. Prefer grouped focused commands so the wrapper still receives explicit files and no broad test entrypoint is used.

Run:

```bash
pnpm test:focused -- packages/story-localization/src/story-workflow.schemas.unit.test.ts packages/story-localization/src/story-workflow-store.unit.test.ts apps/cli/src/story-pipeline-command.unit.test.ts
pnpm test:focused -- packages/image-generation/src/image-batch-planner.unit.test.ts packages/domain/src/shared-visuals.unit.test.ts
pnpm test:focused -- packages/image-generation/src/image-batch-service.unit.test.ts packages/image-generation/src/openai-image.unit.test.ts
pnpm --filter @mediaforge/image-generation typecheck
```

If grouped `test:focused` behavior is not accepted by the wrapper, run the directly affected file first for the active task and stop before exceeding three distinct test commands. Do not run broad build, broad test, broad typecheck, snapshot updates, fixture regeneration, provider calls, uploads, or remote commands.

## Required Report

After implementation, create or update:

`docs/reports/2026-07-08/code-review-follow-up-batch-c-implementation-report.md`

Include source task files, summary, changed files, tests/checks run, results, incomplete items, deviations, remaining risks, and next recommended batch.

## Assumptions

- Batch A and Batch B are accepted based on existing reports in `docs/reports/2026-07-08/`.
- Existing unrelated dirty files remain untouched.
- Full story workflow orchestration beyond the first executable source boundary remains unfinished in this batch and must be reported as such.
- No commit is created unless explicitly requested.
