Summary: Added format-specific thumbnail reference support so `full` and `short` can use different reference images, updated episode `028` to use the requested dollhouse reference for `full` and a derived portrait companion for `short`, and kept the existing red/white left-side typography behavior intact.

Changed paths:
- `packages/image-generation/src/thumbnail-contracts.ts`
- `packages/image-generation/src/story-thumbnail.unit.test.ts`
- `apps/cli/src/thumbnail-commands.ts`
- `apps/cli/src/thumbnail-commands.unit.test.ts`
- `apps/cli/src/youtube-upload-thumbnail.ts`
- `apps/cli/src/youtube-upload-thumbnail.unit.test.ts`
- `episodes/028-the-man-in-the-attic/story-production/thumbnail-story.json`
- `content-ideas/thumbnails-en/003-her-father-disappeared-then-she-found-him-inside-the-dollhouse-short.png`

Tests:
- `pnpm exec vitest run -c vitest.unit.config.ts apps/cli/src/thumbnail-commands.unit.test.ts apps/cli/src/youtube-upload-thumbnail.unit.test.ts packages/image-generation/src/story-thumbnail.unit.test.ts` ✅

Commit hash:
- `9e3ba734272ae430efca0a09bda11912bbc254a6`

Unresolved risks:
- No live OpenAI thumbnail regeneration was rerun in this task; moderation/provider outcomes may still block some variants.
