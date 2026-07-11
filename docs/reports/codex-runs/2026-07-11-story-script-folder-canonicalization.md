Summary: Aligned story rewrite persistence with the documented canonical script layout by mirroring generated scripts into `episodes/<episode>/languages/` and teaching short-rewrite discovery to prefer `languages/script-en.md`. Episode `035` now has its English full script at the canonical authored path.

Changed paths:
- `packages/story-localization/src/story-script-paths.ts`
- `packages/story-localization/src/canonical-full-story.persistence.ts`
- `packages/story-localization/src/story-localization.service.ts`
- `packages/story-localization/src/story-localization-batch-service.ts`
- `packages/story-localization/src/short-rewrite.utils.ts`
- `packages/story-localization/src/short-rewrite.resolution.ts`
- `packages/story-localization/src/short-rewrite.unit.test.ts`
- `packages/story-localization/src/story-localization.integration.test.ts`
- `episodes/035-the-wendigo-legend/languages/script-en.md`

Tests/checks:
- `pnpm exec vitest run -c vitest.unit.config.ts packages/story-localization/src/short-rewrite.unit.test.ts --bail=1 -t "builds canonical output paths and protects the output root|resolves explicit inputs and detects ambiguous English full stories"`
- `pnpm exec vitest run -c vitest.integration.config.ts packages/story-localization/src/story-localization.integration.test.ts --bail=1 -t "generates the canonical English full story and English short|generates full and short outputs for de"` failed before new path assertions on a pre-existing mock/validator mismatch (`Full word count 183 outside range 639-751...`).

Risks: Legacy compatibility files under `en/full`, `<lang>/full`, and root `script.md` are still written for downstream compatibility. Existing broader integration fixtures need refresh before the full integration file will pass cleanly.

Commit: `96bc991b4f481e79eabaf0d4c4949f9ef50da7db`
