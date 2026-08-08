# Historical visual direction resolver

**Date:** 2026-08-08  
**Summary:** Episode-level OpenAI visual-direction resolver with durable persisted artifact, reuse across regeneration paths, and approval-pack exposure.

## Files changed

- `packages/history/src/history-visual-direction-v1.ts` (new)
- `packages/history/src/history-visual-direction-resolver-v1.ts` (new)
- `packages/history/src/history-visual-direction-v1.unit.test.ts` (new)
- `packages/history/src/history-visual-direction-resolver-v1.unit.test.ts` (new)
- `packages/history/src/history-workflow-v35.ts`
- `packages/history/src/index.ts`
- `packages/image-generation/src/history-visual-direction-openai-v1.ts` (new)
- `packages/image-generation/src/history-visual-direction-bridge-v1.ts` (new)
- `packages/image-generation/src/history-visual-direction-bridge-v1.unit.test.ts` (new)
- `packages/image-generation/src/history-image-prompt.ts`
- `packages/image-generation/src/episode-image-pipeline.ts`
- `packages/image-generation/package.json`
- `apps/cli/src/index.ts`

## Persisted artifact path

`episodes/<episode>/source/history-v3.5/history-visual-direction.v1.json`

## Resolver integration point

`buildEpisodeScenePlans()` in `episode-image-pipeline.ts` calls `getOrResolveHistoricalVisualDirectionForEpisode()` once per image-plan/generate run before prompt construction.

## Tests/checks

- `pnpm test:focused -- packages/history/src/history-visual-direction-resolver-v1.unit.test.ts` (5/5)
- `pnpm test:focused -- packages/history/src/history-visual-direction-v1.unit.test.ts` (1/1)
- `pnpm test:focused -- packages/image-generation/src/history-visual-direction-bridge-v1.unit.test.ts`
- `pnpm test:focused -- packages/image-generation/src/history-image-cinematography.unit.test.ts` (10/10)
- `pnpm test:focused -- packages/image-generation/src/history-image-prompt.unit.test.ts` (3/3)
- `pnpm --filter @mediaforge/history typecheck`
- `pnpm --filter @mediaforge/image-generation typecheck`

## Risks / follow-up

- History `dist` must be rebuilt after export changes before image-generation typecheck.
- Live OpenAI resolution not exercised in CI; fallback path covered by unit tests.
