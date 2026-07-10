Summary: Fixed Shorts image preparation so valid cached key-scene portraits are reused instead of being forced through native regeneration again, and short image work now honors bounded concurrency from image settings.

Changed files:
- `packages/image-generation/src/shorts-image-strategy.ts`
- `packages/image-generation/src/shorts-image-strategy.unit.test.ts`

Tests/checks run:
- `pnpm exec vitest run packages/image-generation/src/shorts-image-strategy.unit.test.ts`

Results:
- Passed: 12/12 tests

Risks remaining:
- `episode short` still has no CLI-level `--concurrency` flag; concurrency is currently driven by `OPENAI_IMAGE_CONCURRENCY`.
- The default Shorts strategy still marks many scenes as key scenes because `SHORTS_KEY_SCENE_RATIO` defaults to `0.8`.

Follow-up tasks:
- Add a first-class `--concurrency` option to `episode short`.
- Revisit default key-scene selection so reruns are less regeneration-heavy by default.
