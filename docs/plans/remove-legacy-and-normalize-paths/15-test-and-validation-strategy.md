# Test And Validation Strategy

## Command budget

Use focused tests first. Do not run full repository tests, full build, broad lint, or snapshot regeneration unless explicitly authorized.

## Exact commands

```bash
pnpm test:focused -- packages/shared/src/episode-filesystem.unit.test.ts
pnpm test:focused -- packages/story-localization/src/full-rewrite.resolution.unit.test.ts
pnpm test:focused -- packages/story-localization/src/short-rewrite.unit.test.ts
pnpm test:focused -- packages/story-localization/src/story-production-analysis.unit.test.ts
pnpm test:focused -- packages/speech/src/script-markdown.unit.test.ts
pnpm test:focused -- packages/speech/src/narration-paths.unit.test.ts
pnpm test:focused -- apps/cli/src/story-full-rewrite-command.unit.test.ts
pnpm test:focused -- apps/cli/src/story-short-rewrite-command.unit.test.ts
pnpm test:focused -- apps/cli/src/story-analysis-command.unit.test.ts
pnpm test:focused -- apps/cli/src/episode-commands.unit.test.ts
pnpm test:focused -- apps/cli/src/index.unit.test.ts
pnpm --filter @mediaforge/shared typecheck
pnpm --filter @mediaforge/story-localization typecheck
pnpm --filter @mediaforge/cli typecheck
pnpm exec eslint packages/shared/src/episode-filesystem.ts
pnpm exec eslint apps/cli/src/index.ts
```

## Required new tests

- Dark Truth app initialization without `@mediaforge/pipeline`.
- Full-video wiring from resolver to analysis, scene planning, image planning, narration setup, subtitle setup, render setup.
- Short wiring from resolver to short analysis, shot planning, narration setup, vertical render setup.
- English and German 022 canonical resolution.
- Multiple languages in one episode.
- Missing language failure.
- Missing variant failure.
- Ambiguous layout failure.
- Path traversal rejection.
- Cache and artifact path separation for language and variant.
- CLI/application parity.
- API startup without pipeline.
- Legacy entry-point absence and package import failure.
- Stale configuration absence.

## Paid API avoidance

Use dry-run, mock providers, fixture scripts, validation-only narration, mock image generation, and render setup validation. No normal validation should require OpenAI, YouTube, remote render, or paid speech/image calls.

## Mandatory stale searches

Search all case/name forms for:

```text
script.md
en/full/script.md
de/full/script.md
full/script.md
languages/script-
legacy
deprecated
@mediaforge/pipeline
createPipeline
narrationPipelineMode
MEDIAFORGE_NARRATION_PIPELINE_MODE
state/image-generation/images
original-transcript.json
audio/script-source
```

Each remaining match must be classified as `VALID_ACTIVE_REFERENCE`, `VALID_HISTORICAL_REFERENCE`, `FALSE_POSITIVE`, or `REQUIRES_REMOVAL`.
