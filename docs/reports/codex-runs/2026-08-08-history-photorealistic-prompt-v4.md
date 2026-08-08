# History photorealistic prompt v4 and scenes 6-8 regen

## Summary
Applied photographic prompt settings (35mm, natural light, shallow DOF, film grain), history-specific lighting/mood/time-of-day derivation, forbidden-anachronism fix, and `promptVersion: 4`. Kept `OPENAI_IMAGE_QUALITY` unchanged (`low`). Force-regenerated Napoleon ep 02 scenes 006–008.

## Changed files
- `packages/image-generation/src/history-image-prompt.ts`
- `packages/image-generation/src/episode-image-pipeline.ts`
- `packages/image-generation/src/history-image-prompt.unit.test.ts`
- `packages/history/src/task-registry.ts`

## Tests / commands
- `pnpm test:focused -- packages/image-generation/src/history-image-prompt.unit.test.ts` — 3/3 pass
- `pnpm exec tsc -p packages/image-generation` — pass
- `pnpm mediaforge -- images generate ... --scene scene-006..008 --force` — pass

## Output hashes
- scene-006: `9f6fd715389dd8d8e9cfc02b45926dbf7e76c25b7304f55f70fd61169f69fbb4`
- scene-007: `b6c9d1d695ddd63b82da007d243c5dceeafc4418af43c413fbc8d1bc14dd6cb6`
- scene-008: `ce891d48f8e6c480158179eae492f374ddbec7f5f2ac387492998032eb220012`

## Risks
- Existing `shared/scenes.json` still has illustrative `imagePrompt` text; sanitizer strips it at render time. Future scene-plan runs pick up task-registry template.
- Scenes 001–005 remain on `promptVersion: 3` until re-forced.
