# L01 image-prompt generation

Date: 2026-08-11

## Changed files

- `packages/strategic-reinvention/src/positioning-production-adapter.ts`
- `packages/strategic-reinvention/src/positioning-production-adapter.unit.test.ts`
- `episodes/l01-why-being-good-at-your-job-isnt-enough/source/pre-image-semantic-plan.v1.json`
- `episodes/l01-why-being-good-at-your-job-isnt-enough/manifest.json`
- `episodes/l01-why-being-good-at-your-job-isnt-enough/review-packs/pre-image-planning/en-full/run-1786423013845/`

## Result

Generated 25 atomic 16:9 provider prompts across 18 canonical scenes with one `gpt-5.6-terra`/low batch. Usage: 16,250 input, 7,690 output, 0 cached input tokens; estimated cost $0.132904. The completed cache was reused on materialization retry. Image calls: 0. TTS calls: 0.

Fixed multi-asset scene wrappers to select the primary asset consistently with same-snapshot validation. All 25 final assets have typed compilation records and the final prompt set hash is `894cb5dee80adb46609131fdcb471287ffe7a40bb93e49738b7eb094416a179f`.

## Checks

- `pnpm exec vitest run --bail=1 packages/strategic-reinvention/src/positioning-production-adapter.unit.test.ts`: new primary-asset regression passed; 3 passed before an unrelated existing long-form state-complexity assertion failed.
- `pnpm --filter @mediaforge/strategic-reinvention build`: passed.
- `veronica-media prepare-production ...`: passed after the fix.
- `veronica-media images derive-image-prompts ...`: passed; 25 cache hits, 0 stale assets.

## Remaining risks and follow-up

Paid source-grounded scene and sequence QA were not authorized for this prompt-only run. Readiness remains fail-closed pending QA and human pre-image approval. Existing selected audio was read only for canonical timing; no TTS request occurred.
