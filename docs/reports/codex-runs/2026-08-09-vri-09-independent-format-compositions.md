# VRI-09 independent format compositions

- Date: 2026-08-09
- Summary: Added one shared rendering composition contract and a canonical Veronica adapter. Immutable descriptors preserve one language-independent image identity while requiring separate 16:9 and 9:16 composition, source-slide, crop/layout, text-layout, and safe-area revisions. The validation-only handoff rejects missing derivatives, semantic mismatches, shared composition IDs, and shared source-slide IDs before render work.
- Changed files: `packages/veronica-media/src/composition/aspect-ratio.ts`, `packages/veronica-media/src/composition/aspect-ratio.unit.test.ts`, `packages/rendering/src/composition-contract.ts`, `packages/rendering/src/composition-contract.unit.test.ts`, `packages/rendering/src/index.ts`, `packages/rendering/package.json`.
- Checks run: `pnpm test:focused -- packages/veronica-media/src/composition/aspect-ratio.unit.test.ts`; `pnpm test:focused -- packages/rendering/src/composition-contract.unit.test.ts`; `pnpm --filter @mediaforge/rendering build`.
- Results: focused suites passed (4 and 2 tests). The rendering package build remains blocked by the existing unresolved `@mediaforge/process-runner` package entry.
- Risks: this is a contract-only change; no provider dispatch or live render was enabled. Consumers must supply the persisted descriptors to their artifact store/renderer integration.
- Follow-up: wire the composition descriptors into the existing orchestration persistence boundary when that owner is scheduled; restore the rendering dependency build chain before relying on an isolated package build.
