# MICRO-046 audio and TTS canary readiness

Date: 2026-08-12
Task: MICRO-046
Status: DONE

## Goal

Evaluate whether exact localized scripts may enter bounded TTS/timing calibration via `AUDIO_TTS_READY` without visual or render dependencies.

## Files changed

- `packages/microdrama/src/audio-tts-readiness.ts`
- `packages/microdrama/src/audio-tts-readiness.unit.test.ts`
- `packages/microdrama/src/index.ts`
- `docs/tasks/microdrama/implementation-backlog.json`

## Validation

- `pnpm exec vitest run -c vitest.unit.config.ts packages/microdrama/src/audio-tts-readiness.unit.test.ts` — 7 passed

## External calls

None.

## Backlog

- MICRO-046 → DONE

## Risks

- Spoken-script hash binds extracted master-story text, not the full imported markdown file hash.
