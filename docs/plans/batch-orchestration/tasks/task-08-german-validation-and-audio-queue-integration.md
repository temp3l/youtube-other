# Task 08: German Validation And Audio Queue Integration

## Objective

Catch German narration issues before TTS and integrate the existing narration pipeline behind orchestration-aware status and blocking rules.

## Existing Functionality To Reuse

- `packages/story-localization/src/localized-content-text.ts`
- `packages/story-localization/src/generated-story-validator.ts`
- `packages/speech/src/narration-pipeline.ts`
- `packages/speech/src/audio-validation.ts`
- `packages/speech/src/narration-pacing.ts`

## Scope

- localization cleanup validation before audio generation
- `stories audio generate`
- `stories audio validate`
- per-output audio failure and readiness reporting

## Files Likely To Inspect

`packages/story-localization/src/localized-content-text.ts`, `packages/story-localization/src/generated-story-validator.ts`, `packages/speech/src/narration-pipeline.ts`, `packages/speech/src/audio-validation.ts`, `packages/speech/src/narration-pacing.ts`

## Files Likely To Edit

Validation adapters, audio CLI wrappers, production-state updates for audio outputs.

## Implementation Steps

1. Reuse German Unicode diagnostics before narration generation starts.
2. Add checks for headings/metadata leakage into spoken text.
3. Wrap the existing narration pipeline for multi-episode, multi-language, multi-profile execution.
4. Persist audio readiness and retryable failure state per output.

## Tests To Add/Update

- missing umlaut detection
- metadata leakage detection
- pacing preset coverage
- audio duration/WPM validation
- blocked render target when audio fails

## Verification Commands

`pnpm test:focused -- packages/story-localization/src/localized-content-text.unit.test.ts`
`pnpm test:focused -- packages/story-localization/src/generated-story-validator.unit.test.ts`
`pnpm test:focused -- packages/speech/src/narration-pipeline.unit.test.ts`

## Risks

Narration preparation and validation currently span several speech modules. Avoid adding a second spoken-text normalization path.

## Rollback Notes

Keep existing narration commands intact while adding wrappers and preflight gates.

## Acceptance Criteria

German TTS-unsafe text is marked `validation_failed` before audio generation, and audio failures block only affected outputs.

## Parallelization Notes

Do not parallelize with task 09.
