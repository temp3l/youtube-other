# Episode 029 Short YouTube Upload

Date: 2026-07-10
Commit: a22fbda

## Summary
- Created episode 029 short EN/DE narration audio, vertical videos, short metadata, and thumbnails.
- Uploaded both Shorts privately to YouTube.
- EN video: `8DRgmNBDBII` (`https://youtu.be/8DRgmNBDBII`)
- DE video: `lqrwoDvAXZw` (`https://youtu.be/lqrwoDvAXZw`)

## Changed Paths
- `episodes/029-the-ghost-train-of-silver-pines/locales/en/short/`
- `episodes/029-the-ghost-train-of-silver-pines/locales/de/short/`
- `episodes/029-the-ghost-train-of-silver-pines/thumbnails/short/`
- `episodes/029-the-ghost-train-of-silver-pines/thumbnails/backgrounds/short-*.png`
- `episodes/029-the-ghost-train-of-silver-pines/state/uploads/reports/en-short/`
- `episodes/029-the-ghost-train-of-silver-pines/state/uploads/reports/de-short/`
- `episodes/029-the-ghost-train-of-silver-pines/state/render-conflict-backup/`

## Tests/Checks
- `ffprobe` verified EN/DE source MP4s and upload MP4s as H.264 1080x1920; uploaded sources are 87.834s and 55.434s.
- `youtubeMetadataSchema.parse` passed for both short metadata files.
- Thumbnail file existence checks passed.
- Upload reports confirmed status `uploaded`, privacy `private`, no warnings.

## Risks
- Short videos were assembled directly with FFmpeg because the built-in vertical renderer selected the full timeline.
- FFmpeg reported end-of-file WAV packet warnings from generated narration chunks, but clip/video generation completed.
- Duplicate generated scene images were moved into render conflict backup during render conflict cleanup.
