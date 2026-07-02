# Task 03: Spoken Narration Preparation

## Objective

Create the spoken narration preparation stage and reviewable artifacts.

## Rationale

Canonical localized story text should remain untouched while TTS receives narration optimized for spoken rhythm.

## Current Relevant Files and Symbols

- `packages/speech/src/script-markdown.ts`: `loadEpisodeScriptMarkdown`, `splitEpisodeScriptMarkdown`.
- `packages/story-localization/src/language-profiles.ts`: `LANGUAGE_PROFILES`.
- `apps/cli/src/index.ts`: `loadValidatedNarrationDependency`.

## Exact Files Likely Modified or Created

- `packages/speech/src/spoken-narration.ts`
- `packages/speech/src/spoken-narration.unit.test.ts`
- `packages/speech/src/narration-schemas.ts`
- `packages/speech/src/index.ts`

## Dependencies

Task 02.

## Implementation Steps

- Load canonical source narration text and fingerprint it.
- Implement deterministic cleanup mode.
- Persist `spoken-text.md` and `spoken-text.json`.
- Add optional adapter shape for future OpenAI adaptation, but do not call OpenAI in this task unless explicitly enabled.
- Validate hook preservation and rough word-count bounds.

## Types or Interfaces

`SpokenNarrationArtifact`, `PrepareSpokenNarrationRequest`, `PrepareSpokenNarrationResult`.

## Runtime Validation Requirements

Reject empty spoken text; warn on large word-count drift; preserve parent fingerprint.

## Error-Handling Behavior

Return failed artifact metadata when preparation fails after output path resolution.

## Observability Requirements

Log episode, language, variant, preparation mode, source hash, output hash, and warnings.

## Performance Considerations

Default mode is local and linear in text length.

## Security Considerations

Do not log full narration text.

## Test Requirements

`pnpm test:focused -- packages/speech/src/spoken-narration.unit.test.ts`

## Acceptance Criteria

Canonical source is not overwritten and spoken artifacts are reproducible.

## Explicit Non-Goals

No OpenAI adaptation prompt implementation in the first slice.

## Rollback Considerations

Delete spoken artifacts and return to canonical narration input.

## Recommended Minimum Model

GPT-5.

## Recommended Best Model

GPT-5.5.

## Parallelization

Parallel-safe with Tasks 04 and 06 after Task 02.
