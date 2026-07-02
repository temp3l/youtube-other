# Task 05: Performance Direction Planner

## Objective

Add deterministic and optional OpenAI-assisted performance direction planning.

## Rationale

Per-chunk delivery instructions should vary mood, pace, restraint, pauses, emphasis, and flow while retaining deterministic fallback.

## Current Relevant Files and Symbols

- `packages/speech/src/voice-settings.ts`: voice instruction templates.
- `packages/dark-truth/src/index.ts`: `SpeechSegment`.
- `packages/story-localization/src/story-localization.service.ts`: structured OpenAI Responses patterns.

## Exact Files Likely Modified or Created

- `packages/speech/src/performance-direction.ts`
- `packages/speech/src/performance-direction.unit.test.ts`
- `packages/speech/src/narration-schemas.ts`
- `packages/speech/src/index.ts`

## Dependencies

Tasks 02 and 04.

## Implementation Steps

- Implement deterministic defaults by role and variant.
- Add negative constraints inheritance.
- Validate emphasis words against chunk text.
- Add optional planner request builder for future OpenAI structured output.
- Persist direction set with planner mode and fingerprints.

## Types or Interfaces

`NarrationDirection`, `NarrationDirectionSet`, `PerformancePlannerConfig`.

## Runtime Validation Requirements

Clamp or reject invalid intensity/restraint/pauses according to schema policy.

## Error-Handling Behavior

If OpenAI-assisted planning fails, record failure metadata and return deterministic directions when fallback is enabled.

## Observability Requirements

Log planner mode, fallback use, chunk count, and validation warnings.

## Performance Considerations

Deterministic mode is free; OpenAI mode is one request per language/variant.

## Security Considerations

Planner prompts must not include secrets or full logs.

## Test Requirements

`pnpm test:focused -- packages/speech/src/performance-direction.unit.test.ts`

## Acceptance Criteria

Every chunk receives validated directions and negative constraints.

## Explicit Non-Goals

Do not synthesize audio.

## Rollback Considerations

Use base voice instructions only.

## Recommended Minimum Model

GPT-5.

## Recommended Best Model

GPT-5.5.

## Parallelization

Parallel-safe with Tasks 09 and 11 after Task 04.
