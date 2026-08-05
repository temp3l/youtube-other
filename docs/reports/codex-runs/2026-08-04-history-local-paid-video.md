# History local paid video run

## Changed files

- `packages/history/src/task-registry.ts`
- `apps/cli/src/index.ts`
- `packages/image-generation/src/episode-image-pipeline.ts`
- `packages/rendering/src/index.ts`

## Tests and checks

- `pnpm exec tsc -p packages/history/tsconfig.json --noEmit` — passed.
- `pnpm exec tsc -p apps/cli/tsconfig.json --noEmit` — passed.
- `pnpm test:focused -- packages/history/src/content-pack.unit.test.ts` — 4 passed.
- `pnpm exec tsc -p packages/rendering/tsconfig.json --noEmit` — passed.
- `pnpm --filter @mediaforge/rendering build` — passed.

## Results

History workflow stages now create local source, factuality, visual-plan, and artifact-gate records. The English episode generated 16 OpenAI images and OpenAI TTS narration through the CLI. Rendering now holds an exclusive output lock; incomplete duplicate clip files were removed and a single locked FFmpeg render completed. The final 1920×1080 H.264/AAC video is 432.173 seconds and passed final-media validation.

## Risks and follow-up

The source assessment is local/declared-source evidence, not publication approval. Thumbnail and release validation were not requested. The collective-noun image validation adjustment has not received a dedicated test.
