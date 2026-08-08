# ElevenLabs narration MP3 adoption

## Summary
Added `resolveEpisodeNarrationAudioPath` to prefer `narration_elevenlabs.mp3` over `narration.wav` for render and segment slicing. Resliced Napoleon ep 02 segments from the ElevenLabs MP3.

## Changed files
- `packages/shared/src/narration-audio.ts`
- `packages/rendering/src/index.ts`
- `apps/cli/src/index.ts` (`audio reslice-segments`)
- `scripts/reslice-narration-segments.mjs`

## Commands
- `pnpm test:focused -- packages/shared/src/narration-audio.unit.test.ts` — pass
- `pnpm exec tsx scripts/reslice-narration-segments.mjs history-youtube-history-10-video-story-pack-02-napoleons-invasion-of-russia` — pass (16 segments)

## Risks
- CLI `audio reslice-segments` needs `apps/cli` dist rebuild (tsc still has unrelated errors).
- If ElevenLabs duration differs from scene-plan timing, run `history visuals reconcile-audio --audio-path .../narration_elevenlabs.mp3` before final render.
