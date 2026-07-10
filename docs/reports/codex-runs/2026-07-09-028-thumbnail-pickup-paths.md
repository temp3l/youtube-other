Summary: Moved episode `028` thumbnail reference assets into the episode root under `story-production/thumbnail-references`, updated the episode thumbnail story files to point at those local references, and published the generated full/short thumbnails into `content-ideas/audio-ready-thumbnails/en` and `de` so YouTube upload can discover them by default.

Changed paths:
- `episodes/028-the-man-in-the-attic/story-production/thumbnail-story.json`
- `episodes/028-the-man-in-the-attic/story-production/thumbnail-story-de.json`
- `episodes/028-the-man-in-the-attic/story-production/thumbnail-references/dollhouse-reference-full.png`
- `episodes/028-the-man-in-the-attic/story-production/thumbnail-references/dollhouse-reference-short.png`
- `content-ideas/audio-ready-thumbnails/en/028-the-man-in-the-attic.png`
- `content-ideas/audio-ready-thumbnails/en/028-the-man-in-the-attic-short-thumbnail.png`
- `content-ideas/audio-ready-thumbnails/de/028-the-man-in-the-attic.png`
- `content-ideas/audio-ready-thumbnails/de/028-the-man-in-the-attic-short-thumbnail.png`

Tests:
- `file ...` checks on episode-local reference assets and upload pickup files ✅
- `pnpm mediaforge -- thumbnails generate --episode-slug 028-the-man-in-the-attic --locale en --format short --dry-run --json` ⚠️ conflict expected because existing thumbnail artifacts were not overwritten without `--force`

Commit hash:
- `9e3ba734272ae430efca0a09bda11912bbc254a6`

Unresolved risks:
- `en/full` and `de/short` remain the previously generated versions in the episode tree because regenerated provider attempts were blocked earlier by OpenAI moderation.
