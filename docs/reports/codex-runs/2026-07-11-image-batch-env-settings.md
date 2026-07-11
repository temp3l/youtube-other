Summary: Fixed image batch commands to honor `.env`-driven image transport and batch settings consistently. Batch prepare now uses reference-image model/size/quality from runtime env config, scene/short settings still come from the shared episode image loader, and batch submit/status/download now pass OpenAI base URL, organization, project, retry, and timeout settings through the batch client.

Changed paths:
- `apps/cli/src/images-batch-commands.ts`
- `apps/cli/src/images-batch-commands.unit.test.ts`
- `packages/story-localization/src/story-localization-openai-batch.ts`

Tests/checks:
- `pnpm test:focused -- apps/cli/src/images-batch-commands.unit.test.ts`
- `pnpm test:focused -- packages/story-localization/src/story-localization.batch.integration.test.ts`

Results: `images-batch-commands.unit.test.ts` passed. `story-localization.batch.integration.test.ts` failed on a pre-existing unrelated error: `planPromptCache is not a function` from `packages/story-localization/src/story-localization-batch-service.ts:914`.

Risks/follow-up: This fix does not retroactively change already-prepared manifests; existing failed image batches must be re-prepared or retried after env/model configuration is corrected. If desired, add a dedicated test around `createOpenAiStoryClientWithOptions` env fallback for organization/project.

Commit: `96bc991b4f481e79eabaf0d4c4949f9ef50da7db`
