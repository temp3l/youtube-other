# Task 09: Evidence Insert Model

## 1. Objective

Add typed, fact-provenanced local evidence inserts that create visual novelty without new AI images.

## 2. Dependencies

Tasks 02 and 06.

## 3. Likely Files

- `packages/domain/src/index.ts`
- `packages/story-localization/src/story-artifact-model.ts`
- New insert rendering helpers.

## 4. Implementation Steps

- Add insert types for clock, document, recording, message, timestamp, location, medical reading, waveform, room number, and note.
- Require `sourceFactId` or equivalent provenance.
- Add localization fields and safe-area metadata.
- Add cache key based on content, locale, style version, dimensions, and source fact.
- Do not invent evidence from narration text without provenance.

## 5. Tests

- `pnpm test:focused -- packages/visual-planning/src/evidence-inserts.unit.test.ts`
- `pnpm test:focused -- packages/story-localization/src/story-artifact-model.unit.test.ts`

## 6. Acceptance Criteria

- Unsupported or unprovenanced insert content fails validation.
- Insert assets can be cached independently from source images.

## 7. Risks

- Story fact shape may vary across old and new artifacts. Provide conservative no-insert fallback.

## 8. Parallelization

Can run after Task 02 and 06, parallel with renderer work if schema is stable.

## 9. Recommended Model

GPT-5.5 Medium, medium reasoning.

## 10. Commit Boundary

Commit insert model and tests only.

