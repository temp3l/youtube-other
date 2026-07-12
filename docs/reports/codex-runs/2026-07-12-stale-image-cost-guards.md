# Stale Image Cost Guards

Changed files: `apps/cli/src/index.ts`, `apps/cli/src/images-resume-command.ts`, `packages/image-generation/src/episode-image-pipeline.ts`, `packages/rendering/src/index.ts`, `docs/architecture/media-assets-and-delivery.md`, and this report.

Summary: Made image planning a non-destructive cost preflight, rejected episode-wide forced regeneration, changed reuse budgeting to a ten-second visual cadence, stopped pre-validation legacy hydration, quarantined superseded filenames during generation, and made full rendering enforce generated manifest paths and hashes. Existing Shorts key-scene generation plus deterministic landscape transforms remains the default cost-saving strategy.

Tests/checks: `pnpm test:focused -- packages/image-generation/src/episode-image-pipeline.unit.test.ts` (twice) and the exact focal-metadata test filter.

Results: 20 tests passed before the same pre-existing dirty-tree fixture failure stopped the file. The fixture produces 8×8 images while current validation requires 1536×864. No assertion was weakened and no fixture was regenerated.

Risks remaining: Rendering-package focused tests and package typechecks were not run because the image-test repair budget stopped converging. Existing uncommitted source changes overlap the tested image validator.

Follow-up: Update the affected test image helper to emit the canonical generation size, then run the image and rendering unit files.
