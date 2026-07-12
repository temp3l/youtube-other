# Click-optimized thumbnail pipeline

## Changed files

- `apps/cli/src/thumbnail-commands.ts`, `apps/cli/src/youtube-upload-thumbnail.ts`
- `packages/image-generation/src/{index,story-thumbnail,thumbnail-artifact-repository,thumbnail-contracts,thumbnail-prompt-compiler,thumbnail-candidate-ranker,thumbnail-quality-analyzer}.ts`
- `packages/metadata/src/youtube-metadata.ts`
- `prompts/youtube-metadata.prompt.md`, `docs/cli.md`

## Tests/checks

- `pnpm test:focused -- packages/image-generation/src/story-thumbnail.unit.test.ts` — passed (13)
- `pnpm test:focused -- apps/cli/src/thumbnail-commands.unit.test.ts` — passed (4)
- `pnpm test:focused -- apps/cli/src/youtube-upload-thumbnail.unit.test.ts` — passed (2)
- `pnpm --filter @mediaforge/image-generation build` — passed
- `pnpm --filter @mediaforge/cli typecheck` — passed after refreshing image-generation declarations
- `git diff --check` — passed before documentation/report edits

## Risks remaining

- Candidate generation incurs three image calls and requires human YouTube Studio Test & Compare upload.
- Contrast/detail heuristics do not detect faces or predict CTR.

## Follow-up

- Feed Studio experiment results back into hook/concept scoring weights.
