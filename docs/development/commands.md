# Commands

## Root Entrypoints

- `pnpm mediaforge -- <command...>`
- `node apps/cli/dist/index.js <command...>` after building `apps/cli`

## Build and Typecheck

Prefer filtered commands for the app or packages you touched.

- `pnpm --filter @mediaforge/cli build`
- `pnpm --filter @mediaforge/cli typecheck`
- `pnpm --filter @mediaforge/story-localization build`
- `pnpm --filter @mediaforge/story-localization typecheck`
- `pnpm --filter @mediaforge/image-generation build`
- `pnpm --filter @mediaforge/image-generation typecheck`
- `pnpm --filter @mediaforge/rendering build`
- `pnpm --filter @mediaforge/rendering typecheck`
- `pnpm --filter @mediaforge/metadata build`
- `pnpm --filter @mediaforge/metadata typecheck`

## Targeted Tests

Use the root Vitest configs with explicit file paths.

- `pnpm test:unit -- apps/cli/src/index.unit.test.ts`
- `pnpm test:unit -- packages/image-generation/src/image-batch-service.unit.test.ts`
- `pnpm test:integration -- packages/metadata/src/youtube-metadata.integration.test.ts`
- `pnpm test:e2e -- packages/pipeline/src/index.e2e.test.ts`

## Targeted Lint

- `pnpm exec eslint apps/cli/src/index.ts`
- `pnpm exec eslint packages/story-localization/src/story-localization.service.ts`

## Useful Scripted CLI Forms

- `pnpm mediaforge -- episode analyze --episode <episode-id>`
- `pnpm mediaforge -- episode plan --episode <episode-id>`
- `pnpm mediaforge -- episode english --episode <episode-id>`
- `pnpm mediaforge -- episode localized --episode <episode-id>`
- `pnpm mediaforge -- episode short --episode <episode-id>`
- `pnpm mediaforge -- stories localize --episode <episode-id>`
- `pnpm mediaforge -- stories rewrite-full --episode <episode-id>`
- `pnpm mediaforge -- stories rewrite-short --episode <episode-id>`
- `pnpm mediaforge -- images plan --episode <episode-id>`
- `pnpm mediaforge -- images generate --episode <episode-id>`
- `pnpm mediaforge -- images resume --episode <episode-id>`
- `pnpm mediaforge -- render --episode <episode-id>`
- `pnpm mediaforge -- render remote check`
- `pnpm mediaforge -- render remote verify`
- `pnpm mediaforge -- render remote status [--job <job-id>] [--limit <count>] [--all] [--include-logs]`
- `pnpm mediaforge -- render remote logs <job-id> [--clip <clip-id>] [--tail <lines>]`
- `pnpm mediaforge -- render remote cleanup`
- `pnpm mediaforge -- metadata youtube --episode <episode-id>`
- `pnpm mediaforge -- youtube upload --episode <episode-id>`

## Validation Guidance

- Prefer file-targeted Vitest and ESLint runs.
- Do not default to `pnpm build`, `pnpm test`, root `pnpm lint`, or root `pnpm typecheck` for routine narrow changes.
