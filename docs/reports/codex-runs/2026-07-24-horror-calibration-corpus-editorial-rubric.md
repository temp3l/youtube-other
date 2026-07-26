# Horror Calibration Corpus And Editorial Rubric

## Summary

Task 03 adds an offline-only, seven-case synthetic calibration corpus, frozen
baseline manifest/hash, seeded blind A/B packet builder, strict human-rating
schema, deterministic aggregation, and editorial rubric. No production episode,
provider, model analysis, runtime generation path, or generated asset was used.

## Changed Paths

- `packages/story-localization/src/horror-editorial-calibration{,.unit.test}.ts`
- `packages/story-localization/src/__fixtures__/horror-calibration/`
- `docs/development/horror-editorial-calibration-rubric.md`
- `docs/README.md`
- Required implementation/run reports

## Tests

- `pnpm test:focused -- packages/story-localization/src/horror-editorial-calibration.unit.test.ts`
  initially exposed an over-broad title-leak assertion; after one test-only
  correction, 6 tests passed.
- `pnpm --filter @mediaforge/story-localization typecheck` passed.
- Targeted Prettier check found five formatting issues; targeted formatting
  completed.

## Commit

`bd666df` (changes uncommitted).

## Unresolved Risks

The corpus is compact, synthetic, and English-only. No human rating round,
primary metric, practical threshold, or production-episode permission exists.
