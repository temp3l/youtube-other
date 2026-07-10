# Batch Orchestration Test Plan

## Verification Constraints

- No tests may call paid providers.
- Prefer focused Vitest files and one affected-package typecheck only after tests pass.
- Favor fake provider adapters and fixture-based JSONL over live API calls.

## Batch Planning Tests

- `custom_id` generation and parsing
- duplicate `custom_id` rejection
- run ID creation
- plan file writing
- JSONL generation for text runs
- JSONL generation for image runs
- one batch uses one endpoint/model where required

Likely files:

- `packages/story-localization/src/story-localization.batch.integration.test.ts`
- `packages/story-localization/src/story-workflow-batch.unit.test.ts`
- `packages/image-generation/src/image-batch-planner.unit.test.ts`
- new orchestration-focused unit tests near CLI helpers

## Import And Validation Tests

- output order independence
- successful result import
- failed result recording
- partial import detection
- idempotent re-import
- no overwrite of approved artifacts without `--force`
- retry-plan generation for failed items
- retry-plan generation for validation-failed items

## Error Resilience Tests

- one failed image does not abort image import
- one failed image blocks only affected output
- successful images from same batch remain accepted
- `completed_with_failures` is used correctly
- infrastructure failure is distinct from item failure
- `--only-ready` skips blocked outputs and continues ready outputs

## Image Validation Tests

- full generation size is `1536x864`
- short generation size is `864x1536`
- render size is not passed as generation size
- actual dimension mismatch produces asset validation failure
- localized full image reuse works for full renders
- shorts never reuse full images accidentally

Likely files:

- `packages/image-generation/src/video-image-spec.unit.test.ts`
- `packages/image-generation/src/openai-image.unit.test.ts`
- `packages/image-generation/src/image-batch-service.unit.test.ts`
- `packages/image-generation/src/shorts-image-strategy.unit.test.ts`

## German Validation Tests

- missing umlauts are detected before TTS
- headings or metadata leakage are rejected for spoken text
- malformed punctuation likely to harm TTS is flagged
- proper names and thumbnail uppercase text are not overcorrected

Likely files:

- `packages/story-localization/src/localized-content-text.unit.test.ts`
- `packages/story-localization/src/generated-story-validator.unit.test.ts`
- new narration gate tests in `packages/speech/src`

## Audio Validation Tests

- language/profile pacing presets exist
- duration and WPM checks work
- failed audio blocks only affected render target
- successful audio generation continues for unrelated targets

Likely files:

- `packages/speech/src/narration-pacing.unit.test.ts`
- `packages/speech/src/narration-pipeline.unit.test.ts`
- `packages/speech/src/audio-validation.ts` companion tests

## Render Validation Tests

- missing clips rejected
- incomplete clip folders rejected
- missing audio rejected
- invalid images rejected
- final resolution and duration range validated
- render manifest matches actual outputs

Likely files:

- rendering package validation tests
- CLI wrapper tests for `stories render` and `stories production`

## Suggested Verification Commands

```bash
pnpm test:focused -- packages/story-localization/src/story-workflow-batch.unit.test.ts
pnpm test:focused -- packages/story-localization/src/story-localization.batch.integration.test.ts
pnpm test:focused -- packages/image-generation/src/image-batch-planner.unit.test.ts
pnpm test:focused -- packages/image-generation/src/image-batch-service.unit.test.ts
pnpm test:focused -- packages/image-generation/src/video-image-spec.unit.test.ts
pnpm test:focused -- packages/story-localization/src/generated-story-validator.unit.test.ts
pnpm test:focused -- packages/story-localization/src/localized-content-text.unit.test.ts
pnpm test:focused -- packages/speech/src/narration-pipeline.unit.test.ts
```

## Exit Criteria

Do not mark the orchestration rollout ready until:

- text and image imports are proven `custom_id`-safe
- partial image failures no longer abort unaffected outputs
- blocked output logic is visible in CLI status
- audio and render stages reject invalid prerequisites
- retry plans skip successful assets
