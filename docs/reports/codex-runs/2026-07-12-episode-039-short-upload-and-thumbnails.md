Date: 2026-07-12

Summary: Tightened the short-image prompt sanitizer for the remaining `scene-009` moderation case, regenerated short-specific YouTube metadata, produced localized short thumbnails, and uploaded both short videos for episode `039-the-photograph-that-changed`.

Changed files:
- `packages/image-generation/src/episode-image-pipeline.ts`
- `packages/image-generation/src/episode-image-pipeline.unit.test.ts`
- `episodes/039-the-photograph-that-changed/en/short/metadata/*`
- `episodes/039-the-photograph-that-changed/de/short/metadata/*`
- `episodes/039-the-photograph-that-changed/thumbnails/short/en.png`
- `episodes/039-the-photograph-that-changed/thumbnails/short/de.png`

Checks run:
- `pnpm exec vitest run -c vitest.unit.config.ts packages/image-generation/src/episode-image-pipeline.unit.test.ts -t "sanitizes abstract memory-erasure phrasing and malformed prompt placeholders"`
- `pnpm --filter @mediaforge/image-generation build`
- `DARK_TRUTH_ENABLE_PAID_PROVIDERS=true MEDIAFORGE_SCRIPT_LANGUAGE=en pnpm mediaforge -- episode short --episode 039-the-photograph-that-changed`
- Short metadata generation via `packages/metadata/dist`
- EN short upload: video ID `nrkDBgcPMrU`
- DE short upload: video ID `UHhAbnf6b8A`

Results: Focused test passed, package build passed, EN short pipeline completed successfully, both short metadata sets were written, both localized short thumbnails were generated, and both short videos uploaded successfully as private.

Remaining risks / follow-up:
- `state/upload/reports/youtube-upload.json` reflects the latest upload only.
- A broader `episode-image-pipeline.unit.test.ts` run still has the unrelated pre-existing mock-dimension failure noted earlier.
