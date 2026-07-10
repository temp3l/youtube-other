# Episode 025 TTS Speed Preset Hardening

Date: 2026-07-09

Changed files: `packages/speech/src/{narration-pacing.ts,narration-pacing.unit.test.ts,narration-pipeline.ts,narration-pipeline.unit.test.ts,script-markdown.ts,script-markdown.unit.test.ts,spoken-narration.ts,spoken-narration.unit.test.ts,voice-settings.ts,voice-settings.unit.test.ts,dark-truth-adapter.ts,audio-validation.ts,narration-quality-gate.ts,narration-schemas.ts,index.ts}`, `config/voices/dark-truth-documentary/*`, episode 025 localized audio artifacts.

Previous settings found: `gpt-4o-mini-tts`, voice `onyx`, slow/implicit speed behavior including fallback `1`; legacy durations were EN full 400.654s, EN short 91.125s, DE full 589.950s, DE short 117.234s.

New presets: EN full 182 WPM speed 1.12, EN short 188 WPM speed 1.16, DE full 184 WPM speed 1.45, DE short 190 WPM speed 1.60; ES/FR/PT full+short presets are centralized and fail fast if missing.

Regenerated: `locales/en/full/audio/narration.wav` 382.476s, `locales/en/short/audio/narration.wav` 51.632s, `locales/de/full/audio/narration.wav` 373.502s, `locales/de/short/audio/narration.wav` 56.249s. No image/video files changed in the final audio run window.

Commands/checks: focused speech Vitest, `pnpm --filter @mediaforge/speech typecheck`, `pnpm --filter @mediaforge/speech build`, audio narration validate commands for EN/DE full/short, `ffprobe`.

Results: EN short, DE full, DE short READY; EN full READY_WITH_WARNINGS for one chunk validation warning, pacing passed.

Risks/follow-up: legacy `en/full`, `en/short`, `de/full`, `de/short` audio trees remain stale beside the staged `locales/*` outputs.
