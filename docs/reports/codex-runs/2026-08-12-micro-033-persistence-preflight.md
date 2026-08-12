# MICRO-033 persistence and preflight wiring

Date: 2026-08-12

## Summary

Added idempotent SQLite persistence for the Seven Minutes Ahead narrator voice profile, MICRO-033 canary cost bindings (199 minor USD ceiling), and optional voice/credential readiness gates on canary preflight. MICRO-033 remains BLOCKED for dispatch.

## Changed files

- `packages/microdrama/src/micro-033-canary-bindings.ts` (+ unit test)
- `packages/microdrama/src/seven-minutes-ahead-narrator-voice-persistence.ts` (+ unit + integration tests)
- `packages/microdrama/src/en-e001-e003-tts-canary-preflight.ts` (+ unit test updates)
- `packages/microdrama/src/index.ts`
- `docs/reports/codex-runs/2026-08-12-micro-033-authorization-pack.json`

## Tests

- `pnpm test:focused -- packages/microdrama/src/en-e001-e003-tts-canary-preflight.unit.test.ts` — 3 passed
- `pnpm test:focused -- packages/microdrama/src/seven-minutes-ahead-narrator-voice-persistence.integration.test.ts` — 1 passed
- `pnpm test:focused -- packages/microdrama/src/micro-033-canary-bindings.unit.test.ts` — 2 passed

## Risks

Operator must run `ensureSevenMinutesAheadNarratorVoiceProfilePersisted` against production embedded DB before dispatch.

## Follow-up

Register credential handle, issue approvals at 199 minor, bind provider voice after canary evidence.
