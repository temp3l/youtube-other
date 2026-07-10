Summary: Rebuilt `@mediaforge/image-generation` and `@mediaforge/cli` so episode `028` thumbnail generation used the new format-specific reference assets. Regenerated `de/full` and `en/short` successfully with the new `content-ideas` references. `en/full` and `de/short` were blocked by OpenAI moderation.

Changed paths:
- `episodes/028-the-man-in-the-attic/thumbnails/full/de.png`
- `episodes/028-the-man-in-the-attic/thumbnails/backgrounds/full/de.png`
- `episodes/028-the-man-in-the-attic/thumbnails/short/en.png`
- `episodes/028-the-man-in-the-attic/thumbnails/backgrounds/short/en.png`

Tests:
- `pnpm --filter @mediaforge/image-generation build` ✅
- `pnpm --filter @mediaforge/cli build` ✅
- `pnpm mediaforge -- thumbnails generate --episode-slug 028-the-man-in-the-attic --locale en --format full --force --dry-run --json`
- `pnpm mediaforge -- thumbnails generate --episode-slug 028-the-man-in-the-attic --locale en --format short --force --dry-run --json`
- Regeneration commands for `en/de` x `full/short`

Commit hash:
- `9e3ba734272ae430efca0a09bda11912bbc254a6`

Unresolved risks:
- OpenAI moderation blocked `en/full` request `2401157a-8273-4637-9226-c5fc37bbcc77`.
- OpenAI moderation blocked `de/short` request `eea553b6-183c-4589-ba0c-4f8c5b078dba`.
