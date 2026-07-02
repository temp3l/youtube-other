# Task 01: Current State and Path Contracts

## Objective

Add a narrow repository characterization test/documentation slice for narration artifact roots and current compatibility outputs.

## Rationale

The new pipeline must preserve existing `audio/narration.wav`, manifest artifacts, and locale/variant path conventions.

## Current Relevant Files and Symbols

- `apps/cli/src/index.ts`: `localizedAudioBaseDir`, `localizedNarrationPathFromBase`, `commandAudioGenerate`.
- `packages/shared/src/episode-filesystem.ts`: `createEpisodePathResolver`.
- `packages/speech/src/script-markdown.ts`: `loadEpisodeScriptMarkdown`.

## Exact Files Likely Modified or Created

- `packages/speech/src/narration-paths.ts`
- `packages/speech/src/narration-paths.unit.test.ts`
- `packages/speech/src/index.ts`

## Dependencies

None.

## Implementation Steps

- Add path helpers for new `audio/narration/` artifact roots.
- Add compatibility path helpers for current `audio/narration.wav`.
- Keep helpers pure and independent from CLI state.
- Export helpers from `@mediaforge/speech`.

## Types or Interfaces

`NarrationArtifactPathSet`, `NarrationArtifactPathContext`.

## Runtime Validation Requirements

Validate episode ID, locale, and variant with existing shared normalizers where available.

## Error-Handling Behavior

Throw configuration errors for empty episode IDs or unsupported variants.

## Observability Requirements

No logging; callers log path decisions.

## Performance Considerations

Pure path construction only.

## Security Considerations

Reject path traversal by using normalized episode IDs and locale codes.

## Test Requirements

`pnpm test:focused -- packages/speech/src/narration-paths.unit.test.ts`

## Acceptance Criteria

New helpers produce deterministic paths and do not change current CLI behavior.

## Explicit Non-Goals

Do not change audio generation or rendering.

## Rollback Considerations

Remove the new helper files and exports.

## Recommended Minimum Model

GPT-5 mini.

## Recommended Best Model

GPT-5.

## Parallelization

Can run before all other tasks; later tasks depend on it.
