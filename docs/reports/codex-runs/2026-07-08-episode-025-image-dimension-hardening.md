Summary: Root cause was the Dark Truth full-image path loading only `OPENAI_API_KEY` from `.env`, then falling back to square defaults (`1024x1024`) while writing a `16:9` manifest without validating the actual files. I added a typed full/short image-dimension contract, post-generation and reuse validation, localized full-image reuse preflight, batch import normalization to canonical stored sizes, and focused tests.

Changed paths: `packages/image-generation/src/video-image-spec.ts`, `packages/image-generation/src/video-image-spec.unit.test.ts`, `packages/image-generation/src/openai-image.ts`, `packages/image-generation/src/openai-image.unit.test.ts`, `packages/image-generation/src/image-batch-planner.ts`, `packages/image-generation/src/image-batch-planner.unit.test.ts`, `packages/image-generation/src/episode-image-pipeline.ts`, `packages/image-generation/src/image-batch-service.ts`, `packages/image-generation/src/index.ts`, `packages/dark-truth/src/index.ts`, `packages/dark-truth/src/index.unit.test.ts`, `apps/cli/src/episode-commands.ts`, `apps/cli/src/episode-commands.unit.test.ts`, `docs/architecture/media-assets-and-delivery.md`, `docs/cli-batch-images.md`.

Tests: `pnpm exec vitest run -c vitest.unit.config.ts --bail=1 packages/image-generation/src/video-image-spec.unit.test.ts packages/image-generation/src/openai-image.unit.test.ts`; earlier focused runs passed `packages/image-generation/src/image-batch-planner.unit.test.ts` and `packages/dark-truth/src/index.unit.test.ts`.

Results: Passed direct spec and OpenAI-image tests. A broader `apps/cli/src/episode-commands.unit.test.ts` run exposed an unrelated pre-existing synthesized-character assertion failure.

Verify: `pnpm exec vitest run -c vitest.unit.config.ts --bail=1 packages/image-generation/src/video-image-spec.unit.test.ts packages/image-generation/src/openai-image.unit.test.ts packages/image-generation/src/image-batch-planner.unit.test.ts packages/dark-truth/src/index.unit.test.ts`

Episode 025 invalid assets now: yes. `shared/image-manifest.json` references 65 full assets; 65 are invalid against `1920x1080`, and 1 referenced file is missing.

Remaining risks: batch-service normalization changed canonical stored dimensions; downstream unit coverage for that path should be expanded before broad release verification.
