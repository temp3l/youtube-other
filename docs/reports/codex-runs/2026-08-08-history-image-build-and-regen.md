# History image build and Napoleon regen

## Summary
Compiled `@mediaforge/image-generation` after fixing TypeScript errors blocking dist updates. Added history auto-detection from `source/history-v3.5/plan.json` so `pnpm mediaforge` uses `history-documentary` prompts without a CLI rebuild. Regenerated Napoleon ep 02 scenes 001–005 with `promptVersion: 3`.

## Changed files
- `packages/image-generation/src/episode-image-pipeline.ts` — type fixes, history auto-detect
- `packages/image-generation/src/history-image-prompt.ts` — `SceneTextRequirement` typing
- `packages/image-generation/src/shorts-image-strategy.ts` — `promptProfile` field

## Tests / commands
- `pnpm exec tsc -p packages/image-generation` — pass
- `pnpm test:focused -- packages/image-generation/src/history-image-prompt.unit.test.ts` — pass
- `pnpm mediaforge -- images generate ... --scene scene-001..005 --force` — pass (5 scenes)

## Risks
- Full `pnpm build` and `apps/cli` compile still fail on unrelated history/CLI type errors; image pipeline uses compiled `@mediaforge/image-generation` dist.
- Image quality remains `low` unless `OPENAI_IMAGE_QUALITY` is raised.
