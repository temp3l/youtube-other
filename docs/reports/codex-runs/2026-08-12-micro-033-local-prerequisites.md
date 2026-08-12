# MICRO-033 local prerequisites

Date: 2026-08-12

## Summary

Implemented `prepareMicro033BoundedCanaryAuthorization` to persist voice profile, CANARY_APPROVED provider binding, opaque credential handle (env-backed, no secret in SQLite), operator/asset/cost approvals via projections, and re-run canary preflight without TTS dispatch. Integration tests pass when `OPENAI_API_KEY` is set.

## Key modules

- `packages/microdrama/src/micro-033-bounded-canary-authorization-preparation.ts`
- `packages/microdrama/src/micro-033-canary-authorization-persistence.ts`
- `packages/microdrama/src/microdrama-openai-speech-credential.ts`
- `packages/persistence/src/character-voice-sqlite-repository.ts` (`recordBoundedCanaryApprovedProviderBinding`)

## Tests

- `pnpm exec vitest run -c vitest.integration.config.ts packages/microdrama/src/micro-033-bounded-canary-authorization-preparation.integration.test.ts` — **2 passed**
- `pnpm test:focused -- packages/microdrama/src/en-e001-e003-tts-canary-preflight.unit.test.ts` — **3 passed**
- `pnpm test:focused -- packages/persistence/src/character-voice-sqlite-repository.integration.test.ts` — **4 passed**

## Operator action

Call `prepareMicro033BoundedCanaryAuthorization({ dbPath, admittedAt, preparedAt })` against the production embedded DB with `OPENAI_API_KEY` set. No TTS dispatch in that function.

## Risks

- Approvals stored as SQLite projections (not separate approval tables).
- `OPENAI_SECRET_REQUIRED` if env key missing.

## Follow-up

Explicit MICRO-033 execute step only (separate task; still 0 TTS calls until then).
