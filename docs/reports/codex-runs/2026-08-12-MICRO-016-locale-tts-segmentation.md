# MICRO-016 locale TTS segmentation

Date: 2026-08-12
Task: MICRO-016
Status: DONE

## Goal

Produce revision-bound narration/dialogue requests and selected-audio timing contracts with lexical/audio gate integration.

## Files changed

- `packages/speech/src/locale-tts-segmentation.ts`
- `packages/speech/src/index.ts`
- `packages/speech/package.json`
- `packages/alignment/src/locale-tts-alignment.ts`
- `packages/alignment/src/index.ts`
- `packages/alignment/package.json`
- `packages/microdrama/src/locale-tts-segmentation.ts`
- `packages/microdrama/src/locale-tts-segmentation.unit.test.ts`
- `packages/microdrama/src/index.ts`
- `packages/microdrama/package.json`
- `packages/microdrama/tsconfig.json`
- `vitest.unit.config.ts`
- `docs/tasks/microdrama/implementation-backlog.json`

## Validation

- `pnpm test:focused -- packages/microdrama/src/locale-tts-segmentation.unit.test.ts -t 'revision-bound|override lexical|cache identity|lexical and audio gates'` — 4 passed

## External calls

None.

## Backlog

- MICRO-016 → DONE
- MICRO-017, MICRO-046 → READY

## Risks

- Dialogue segmentation uses uppercase `SPEAKER:` line heuristics; richer script markup may need a later parser.
- Audio gate soft/hard limits remain uncalibrated until E001–E003 canary.
