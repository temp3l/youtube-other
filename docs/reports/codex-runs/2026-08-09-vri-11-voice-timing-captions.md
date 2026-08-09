# VRI-11 voice, timing, and captions

- Date: 2026-08-09
- Changed files: `packages/speech/src/creator-voice-policy.ts`, `packages/speech/src/creator-voice-policy.unit.test.ts`, `packages/story-localization/src/strategic-italian-media-persistence.ts`, `packages/story-localization/src/strategic-italian-media-persistence.unit.test.ts`, and `packages/story-localization/src/strategic-italian-qa.ts`.
- Checks: `pnpm test:focused -- packages/story-localization/src/strategic-italian-media-persistence.unit.test.ts` (3 passed); `pnpm test:focused -- packages/speech/src/creator-voice-policy.unit.test.ts` (2 passed); `git diff --check` (passed).
- Result: canonical Veronica identity is enforced; synthetic provider dispatch stays fail-closed; supplied-human audio has immutable provenance and versioned timing/caption derivatives.
- Risk/follow-up: `packages/speech/src/voice-settings.unit.test.ts` could not collect because the existing workspace package entry for `@mediaforge/process-runner` is unresolved. No provider activation was enabled.
