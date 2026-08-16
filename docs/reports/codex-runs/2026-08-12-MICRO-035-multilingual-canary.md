# MICRO-035 multilingual canary

Implemented DE/ES/PT-BR E001–E003 bounded multilingual render canary mirroring MICRO-034, reusing MICRO-034 EN shared visuals (zero new image cost) and synthesizing locale TTS per episode.

## Changed
- `packages/microdrama/src/micro-035-*` (bindings, env, evidence, auth, preflight, ports, execute, tests)
- `packages/microdrama/src/de-es-pt-e001-e003-multilingual-canary-preflight.ts`
- `packages/microdrama/src/audio-tts-readiness.ts` (localized script section markers)
- `packages/microdrama/src/microdrama-openai-speech-credential.ts`
- `packages/microdrama/src/index.ts`
- `scripts/microdrama-prepare-micro-035-authorization.ts`
- `scripts/microdrama-execute-micro-035-canary.ts`
- `docs/tasks/microdrama/implementation-backlog.json`

## Test
`pnpm test:focused -- packages/microdrama/src/micro-035-bounded-multilingual-canary-execute.integration.test.ts -t "authorizes and executes"` — **PASS** (9 episodes, sharedVisualCacheHits > 0).

## Operator execute
`pnpm exec tsx scripts/microdrama-execute-micro-035-canary.ts` — **DONE** (9 outputs, 54 shared-visual cache hits, $15.59 mock TTS/ffmpeg). Evidence: `docs/reports/codex-runs/2026-08-12-micro-035-canary-execution-evidence.json`.

## Risks
Live locale TTS needs `OPENAI_TTS_VOICE_DE` / `ES` / `PT_BR` and real ffmpeg. Operator run used mock ports.
