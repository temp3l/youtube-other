# ElevenLabs TTS integration

## Summary

Added explicit ElevenLabs opt-in to legacy CLI TTS via `MEDIAFORGE_TTS_PROVIDER=elevenlabs`, centralized per-genre voice resolution (`resolveTtsConfig`), history voice defaults, legacy adapter wiring, metadata fields, tests, and docs.

## Changed files

- `packages/speech/src/genre-tts-config.ts`
- `packages/speech/src/genre-tts-config.unit.test.ts`
- `packages/speech/src/platform/legacy-application-adapter.ts`
- `packages/speech/src/audio-instructions.ts`
- `packages/speech/src/index.ts`
- `packages/config/src/index.ts`
- `packages/config/src/index.unit.test.ts`
- `apps/cli/src/index.ts`
- `apps/cli/src/narration-tts-guard.ts`
- `apps/cli/src/narration-tts-guard.unit.test.ts`
- `apps/cli/src/math-commands.ts`
- `.env.example`
- `docs/development/elevenlabs-speech-setup.md`
- `docs/development/configuration.md`

## Tests

- `pnpm test:focused -- packages/speech/src/genre-tts-config.unit.test.ts` (pass)
- `pnpm test:focused -- packages/config/src/index.unit.test.ts` (pass)
- `pnpm test:focused -- apps/cli/src/narration-tts-guard.unit.test.ts` (pass)
- `pnpm exec tsc -p packages/speech/tsconfig.json --noEmit` (pass)

## Risks / follow-up

- No live ElevenLabs smoke test executed.
- `elevenlabs-provider.unit.test.ts` and legacy integration tests not rerun.
- New narration pipeline mode unchanged; legacy path only.
