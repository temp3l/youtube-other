# Task 06: Pronunciation Normalization

## Objective

Implement a scoped pronunciation dictionary and boundary-safe TTS text transform.

## Rationale

OpenAI TTS can benefit from textual pronunciation hints, but canonical story text must remain unchanged.

## Current Relevant Files and Symbols

- `packages/speech/src/voice-settings.ts`: hard-coded fallback pronunciation instructions.
- `packages/dark-truth/src/index.ts`: `pronunciation-guide.json` output.
- `packages/shared/src/index.ts`: `normalizeWhitespace`, `hashText`.

## Exact Files Likely Modified or Created

- `packages/speech/src/pronunciation.ts`
- `packages/speech/src/pronunciation.unit.test.ts`
- `packages/speech/src/narration-schemas.ts`
- `packages/speech/src/index.ts`

## Dependencies

Task 02.

## Implementation Steps

- Define pronunciation entry schema and scopes.
- Load global, language, profile, and episode entries.
- Apply longest-priority boundary-safe replacements.
- Detect collisions and skipped overlaps.
- Persist transform report per chunk or per manifest.

## Types or Interfaces

`PronunciationEntry`, `PronunciationDictionary`, `PronunciationTransformReport`.

## Runtime Validation Requirements

Reject unsafe regex-safe entries, empty replacements, and unresolved mandatory collisions.

## Error-Handling Behavior

Warnings for unused optional entries; errors for unsafe entries.

## Observability Requirements

Log entry counts, applied counts, skipped collisions, and chunk ID.

## Performance Considerations

Compile matchers once per language/episode.

## Security Considerations

Do not execute arbitrary regex; enforce safe subset.

## Test Requirements

`pnpm test:focused -- packages/speech/src/pronunciation.unit.test.ts`

## Acceptance Criteria

Transforms affect only TTS input and produce auditable change records.

## Explicit Non-Goals

No SSML or external pronunciation service.

## Rollback Considerations

Disable dictionary loading and use original chunk text.

## Recommended Minimum Model

GPT-5 mini.

## Recommended Best Model

GPT-5.

## Parallelization

Parallel-safe with Tasks 03, 04, and 09 after Task 02.
