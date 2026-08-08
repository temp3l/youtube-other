# Napoleon ep02 — parallel images + final render

## Summary
Regenerated scenes 010–016 in one parallel batch (concurrency 4, ~43s). Scaled `shared/scenes.json` timing to match `narration_elevenlabs.mp3` (333.7s), resliced audio segments, and rendered the YouTube clean master.

## Changed paths
- `packages/image-generation/src/episode-image-pipeline.ts` — `resolveTargetScenes` in `generateEpisodeImages`
- `apps/cli/src/index.ts` — multi-scene `--scene`, default concurrency 4
- `episodes/.../shared/scenes.json` — timing scaled to ElevenLabs duration
- `episodes/.../locales/en/full/audio/segments/*.wav` — resliced
- `episodes/.../shared/images/generated/scene-010..016*.png` — overwritten (prompt v5)
- `episodes/.../locales/en/full/renders/youtube/youtube-16x9-clean.mp4` — new

## Verification
- Image regen: 7/7 scenes `generated`, `promptVersion: 5` for all 16 manifests
- Render: exit 0, duration 333.838s, size 23MB

## Risks
- Scene timing was proportionally scaled (not word-aligned); spot-check A/V sync on scenes 010–016.
- Image filenames still use pre-scale timestamps; cosmetic only.

## Follow-up
- Human review of final video and captions before upload.
