# MICRO-033 env TTS wiring and live canary

## Summary
Wired `OPENAI_TTS_MODEL`, `OPENAI_TTS_VOICE`, and `OPENAI_TTS_FORMAT` from `.env` through preparation, authorization fingerprints, and live synthesis. Live bounded canary completed for E001–E003.

## Changed files
- `packages/microdrama/src/micro-033-openai-tts-env.ts` (new)
- `packages/microdrama/src/micro-033-bounded-tts-canary-execute.ts`
- `packages/microdrama/src/micro-033-bounded-canary-authorization-preparation.ts`
- `packages/microdrama/src/micro-033-segment-synthesis.ts`
- `packages/persistence/src/character-voice-sqlite-repository.ts`
- `packages/microdrama/src/micro-033-bounded-tts-canary-execute.integration.test.ts`
- `scripts/microdrama-prepare-micro-033-authorization.ts`
- `docs/tasks/microdrama/implementation-backlog.json`

## Tests
- `pnpm test:focused -- packages/microdrama/src/micro-033-bounded-tts-canary-execute.integration.test.ts -t "authorizes and executes bounded canary"` — pass
- Live operator execute via `scripts/microdrama-execute-micro-033-canary.ts` — pass (37 requests, $0.68, ~60s episodes)

## Evidence
- `docs/reports/codex-runs/2026-08-12-micro-033-authorization-evidence.json` — `gpt-4o-mini-tts` / `cedar`
- `docs/reports/codex-runs/2026-08-12-micro-033-canary-execution-evidence.json` — status `DONE`

## Risks
- Operator re-prep rebinding and execute retry paths now supported; prior partial runs leave orphan attributions in DB.
