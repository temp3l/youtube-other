# Task 04 - Full Scene Batch Workflow

Recommended model: GPT-5.4 for orchestration and manifest correctness; GPT-5.4-mini for adapting existing planner/service tests.

Commit after implementation: `feat(image-batch): prepare full scene image batches`

## Objective

Complete batch preparation for full-video scene images across requested languages using canonical scene manifests, prompts, references, and output paths.

## Background

`prepareImageBatchForEpisode` currently requires existing per-scene manifests and only models English/full scenes. Full localized video workflows reuse canonical images today, but the target batch system must support requested language variants when separate localized images are required.

## Scope

- Prepare full scene batch items for selected episode, languages, and full variant.
- Reuse valid existing assets when hashes match.
- Preserve scene-to-image associations through stable identity.
- Split oversized jobs deterministically when request limits are configured.
- Keep canonical output path resolution centralized.

## Out of scope

- Short image batching.
- CLI lifecycle commands.
- Provider submission changes beyond prepared manifests.

## Dependencies

Tasks 02 and 03.

## Repository evidence

- `packages/image-generation/src/image-batch-planner.ts`
- `packages/image-generation/src/episode-image-pipeline.ts`
- `packages/shared/src/episode-filesystem.ts`
- `apps/cli/src/index.ts`
- `apps/cli/src/episode-commands.ts`

## Required changes

- Extend planner inputs to include selected languages and variants.
- Load localized story/scene context through canonical resolvers.
- Prepare prompt files before JSONL generation when missing.
- Group batch items by endpoint and compatible request model.
- Write deterministic manifests and JSONL files.

## Data model or manifest changes

Each item must store episode ID, language, variant `full`, scene ID, asset role, operation, prompt hash, provider request hash, reference dependency hashes, and canonical output path.

## CLI behavior

No final CLI commands yet, but expose a service function that Task 05 can call for `images batch prepare`.

## Error handling and observability

Report missing scene plan, missing prompt, missing reference dependency, duplicate custom ID, duplicate output path, and unsupported endpoint.

## Security and cost controls

Prepare-only must not call OpenAI. Output a request count and model/size/quality summary.

## Tests

- Prepare all full scene requests for one language.
- Prepare selected languages without hard-coding `en`.
- Skip valid existing outputs.
- Split request groups deterministically.
- Refuse duplicate destination paths.

## Verification commands

```bash
pnpm test:focused -- packages/image-generation/src/image-batch-planner.unit.test.ts
pnpm test:focused -- packages/shared/src/episode-filesystem.unit.test.ts
```

## Acceptance criteria

- Full scene batch preparation is deterministic and language-aware.
- Prepared request lines use the correct endpoint for each operation.
- No provider calls happen during preparation.

## Rollback considerations

Keep synchronous `images generate` unaffected. Prepared batch artifacts can be deleted without touching generated scene images.
