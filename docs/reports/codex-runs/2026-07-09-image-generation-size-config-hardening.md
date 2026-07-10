Summary: Root cause was twofold: `.env` image settings were not loaded consistently for story-pipeline image paths, and generated assets were being normalized/validated against final render sizes (`1920x1080` / `1080x1920`) instead of profile-specific generation sizes. Fixed with typed media specs, profile-aware env precedence, strict aspect-ratio parsing, actual-file dimension validation for generate/reuse/resume, and profile-aware OpenAI debug logging.

Changed paths: `packages/image-generation/src/{image-generation-config.ts,video-image-spec.ts,openai-image.ts,episode-image-pipeline.ts,image-batch-{planner,service}.ts,shorts-image-strategy.ts,index.ts}`; `packages/dark-truth/src/{index.ts,index.unit.test.ts}`; `apps/cli/src/{episode-commands.ts,images-batch-commands.ts,images-resume-command.ts,index.ts}`; `.env.example`; `docs/{cli.md,architecture/media-assets-and-delivery.md}`.

Precedence: full=`OPENAI_IMAGE_FULL_SIZE` -> `YOUTUBE_FULL_IMAGE_SIZE` -> `OPENAI_IMAGE_SIZE` -> `1536x864`; short=`OPENAI_IMAGE_SHORT_SIZE` -> `YOUTUBE_SHORT_IMAGE_SIZE` -> `864x1536`.

Tests/checks: `pnpm exec vitest run -c vitest.unit.config.ts --bail=1 packages/image-generation/src/{video-image-spec,openai-image,image-batch-planner,image-batch-service}.unit.test.ts packages/dark-truth/src/index.unit.test.ts`; `pnpm --filter @mediaforge/image-generation build`. Result: pass, 88/88 tests.

Verify: rerun the focused Vitest command above.

Risks: old manifests with render-sized assets now fail fast and require deleting invalid shared image files plus the affected manifest before resume.

Commit hash: not created. Paid providers/images: none. No new images were generated.
