# Batch Orchestration Error Resilience

## Core Rule

One failed item must not abort the whole batch. This rule already exists in parts of:

- `packages/story-localization/src/story-localization-batch-service.ts`
- `packages/image-generation/src/image-batch-service.ts`

The implementation work should make that behavior visible and enforceable across import, validation, gating, retry, and rendering.

## Import Contract

Imports for text and images must:

- use `custom_id` only
- ignore provider output order
- import successful items even when some siblings fail
- record provider failures per item
- record validation failures per item
- remain idempotent on re-run
- skip overwriting approved artifacts unless `--force` is provided
- write `import-report.json`
- write `validation-report.json`
- make partial import discoverable

## Required Failure Record

```json
{
  "runId": "2026-07-09-images-short-025-050",
  "customId": "025-the-endless-backrooms:image:de:short:shot:shot-0007",
  "episodeSlug": "025-the-endless-backrooms",
  "stage": "image-generation",
  "language": "de",
  "profile": "short",
  "assetType": "image",
  "assetId": "shot-0007",
  "provider": "openai",
  "providerRequestId": "optional",
  "errorCode": "image_generation_failed",
  "errorMessage": "provider returned an image generation error",
  "retryable": true,
  "occurredAt": "2026-07-09T00:00:00.000Z",
  "nextAction": "stories images batch retry-plan --run 2026-07-09-images-short-025-050 --failed-only"
}
```

## Image-Specific Resilience Rules

- decode or download every successful image item independently
- validate actual file dimensions with `assertGeneratedImageFileMatchesSpec`
- treat dimension mismatch as `validation_failed`, not as a batch crash
- block only the affected episode/language/profile output
- keep valid sibling images accepted
- keep full-image reuse limited to canonical full outputs only
- never reuse full-video images for shorts

## Text-Specific Resilience Rules

- import English full rewrites independently per episode
- import localizations independently per episode/language
- import shorts independently per episode/language
- run deterministic validation after import
- set `validation_failed` when schema or content gates fail
- require approval before dependent stages proceed

## Retry Planning

Retry plans must support:

- provider failures only
- validation failures only
- expired items only
- blocked outputs only
- selected episode/language/profile only

Retry plan output must include:

- `retry-plan.json`
- new `input.jsonl`
- original `customId`
- retry `customId`
- preserved request body where safe
- skipped successful items list

## Render Behavior Under Partial Failure

`stories render --only-ready` must:

- skip blocked outputs
- continue ready outputs
- summarize skipped targets
- never try to regenerate missing upstream assets implicitly

## User-Facing Summary Requirements

Every sync/import/validate flow should end with:

- succeeded count
- failed count
- validation-failed count
- blocked output list
- unaffected output count
- exact retry command

## Logging Boundary

When debug logging is enabled, log:

- model
- size
- quality
- output format
- stage
- profile
- episode slug
- language
- shot id
- `custom_id`

Do not log raw base64 image payloads.
