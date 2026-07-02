# Task 11: Mastering Profiles

## Objective

Add conservative local mastering profiles for clean narration and render-ready narration.

## Rationale

OpenAI chunk outputs can vary in loudness and boundary tone; mastering should normalize gently without making narration artificial.

## Current Relevant Files and Symbols

- `packages/rendering/src/index.ts`: FFmpeg usage.
- `apps/cli/src/index.ts`: current narration output path.
- `packages/config/src/index.ts`: runtime config schema patterns.

## Exact Files Likely Modified or Created

- `packages/speech/src/mastering.ts`
- `packages/speech/src/mastering.unit.test.ts`
- `packages/config/src/index.ts`
- `packages/speech/src/index.ts`

## Dependencies

Task 10.

## Implementation Steps

- Add mastering profile schema and defaults.
- Build FFmpeg filter chain for high-pass, gentle EQ, light compression, optional de-essing, loudness normalization, and limiting.
- Keep clean assembled narration available separately.
- Persist mastering metadata and validation result.

## Types or Interfaces

`NarrationMasteringProfile`, `NarrationMasteringResult`.

## Runtime Validation Requirements

Validate target loudness, true peak, sample rate, codec, and output path.

## Error-Handling Behavior

If mastering fails, keep clean narration and mark mastered output failed.

## Observability Requirements

Log profile, input/output duration, loudness target, and output path.

## Performance Considerations

Single local FFmpeg pass per output.

## Security Considerations

No shell interpolation; no secrets in metadata.

## Test Requirements

`pnpm test:focused -- packages/speech/src/mastering.unit.test.ts`

## Acceptance Criteria

Mastering is conservative by default and can be disabled per profile.

## Explicit Non-Goals

No music or sound-effect mixing.

## Rollback Considerations

Use clean assembled narration as final compatibility output.

## Recommended Minimum Model

GPT-5 mini.

## Recommended Best Model

GPT-5.

## Parallelization

Parallel-safe with Tasks 12 and 17 after Task 10.
