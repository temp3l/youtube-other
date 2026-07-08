# Shared Visual Manifests

Summary: Added typed shared visual contracts, variant-isolated canonical visual paths, manifest-driven image reuse/generation helper, localized visual validation, renderer timeline lookup by canonical scene ID, focused tests, and docs.

Changed paths: `packages/domain/src/index.ts`, `packages/domain/src/shared-visuals.unit.test.ts`, `packages/shared/src/episode-filesystem.ts`, `packages/shared/src/episode-filesystem.unit.test.ts`, `packages/image-generation/src/canonical-visual-images.ts`, `packages/image-generation/src/canonical-visual-images.unit.test.ts`, `packages/image-generation/src/index.ts`, `packages/alignment/src/localized-visual-validation.ts`, `packages/alignment/src/localized-visual-validation.unit.test.ts`, `packages/alignment/src/index.ts`, `packages/rendering/src/shared-visual-render.ts`, `packages/rendering/src/shared-visual-render.unit.test.ts`, `packages/rendering/src/index.ts`, `docs/plans/shared-visuals/current-flow-audit.md`, `docs/plans/shared-visuals/implementation-notes.md`, `docs/pipeline/shared-visual-scene-plan.md`.

Tests: focused Vitest file list passed, 38 tests. Affected package typecheck passed for domain, shared, image-generation, alignment, rendering.

Commit hash: not created.

Unresolved risks: CLI orchestration is not wired to the new manifests yet. Existing generated episode assets were not migrated. Existing short portrait derivation from full landscape images remains in legacy batch planning and should be made explicit or retired.
