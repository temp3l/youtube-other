# Testing Strategy

## Unit Tests

Add focused tests for:

- spoken-text normalization and source fingerprinting;
- deterministic segmentation and stable IDs;
- role assignment and duration estimates;
- performance default generation;
- context extraction and trimming;
- request fingerprint generation;
- pronunciation replacement boundaries and collisions;
- artifact path generation;
- validation classification;
- manifest ordering;
- configuration merging.

## Integration Tests

Use mocked OpenAI clients only:

- SDK request construction includes current chunk in `input` and context only in `instructions`;
- retry, timeout, and fallback classification;
- partial chunk failure;
- cache reuse;
- artifact persistence;
- resume behavior;
- FFmpeg assembly with fixture WAV files;
- quality gate outcomes.

## Golden Fixtures

Use small deterministic WAV fixtures for:

- valid speech-like tone/noise fixture;
- silence detection;
- clipping detection;
- malformed file;
- ordering;
- trim and pause insertion;
- crossfade eligibility;
- loudness analysis.

Avoid broad snapshot regeneration. Prefer semantic assertions.

## Commands

Preferred validation commands:

- `pnpm test:focused -- packages/speech/src/index.unit.test.ts`
- `pnpm test:focused -- packages/speech/src/script-markdown.unit.test.ts`
- `pnpm test:focused -- packages/speech/src/<new-test>.unit.test.ts`
- one affected-package typecheck after focused tests pass.

Do not call real OpenAI API in CI.

## Manual Listening Test

For voice benchmarking and prompt tuning:

- use one standardized multilingual-capable horror passage;
- anonymize voice labels by default;
- score naturalness, distinctiveness, emotional appropriateness, pronunciation, continuity, listener fatigue, and generic-AI recognizability;
- persist evaluator notes and selected defaults.
