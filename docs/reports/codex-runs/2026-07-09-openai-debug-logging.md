Summary: Added structured OpenAI debug logging with recursive redaction, episode-local log routing, story rewrite pre-dispatch logs, short dry-run prompt logs, image generation/edit logs, and speech generation logs. Logs write to `<episode-root>/debug/openai-calls/`, falling back to `debug/openai-calls/unscoped/`.

Changed paths: `.gitignore`; `docs/development/error-handling.md`; `packages/shared/src/index.ts`; `packages/shared/src/openai-debug-logger.ts`; `packages/shared/src/openai-debug-logger.unit.test.ts`; `packages/story-localization/src/story-localization.service.ts`; `packages/story-localization/src/short-rewrite.service.ts`; `packages/story-localization/src/short-rewrite.service.unit.test.ts`; `packages/image-generation/src/openai-image.ts`; `packages/image-generation/src/episode-image-pipeline.ts`; `packages/speech/src/index.ts`.

Tests/checks: `pnpm test:focused -- packages/shared/src/openai-debug-logger.unit.test.ts` passed after sanitizer fix. `pnpm --filter @mediaforge/shared build` passed. `pnpm --filter @mediaforge/story-localization typecheck` passed. `pnpm --filter @mediaforge/image-generation --filter @mediaforge/speech typecheck` passed.

Unresolved risks: `packages/story-localization/src/short-rewrite.service.unit.test.ts` still failed before the final helper type fix; rerun budget was exhausted, so it was not rerun. Generic metadata/transcription/transcript-cleaning/rewriting curl wrappers and shell scripts are not fully migrated to structured logs.

Commit hash: not committed.
