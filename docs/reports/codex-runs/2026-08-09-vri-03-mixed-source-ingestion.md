# VRI-03 mixed-source ingestion

## Summary

Added revision-bound canonical mixed-source contracts, immutable supplemental-media ingestion metadata, content-hash batch reuse, isolated ingest failures, extraction lineage, and media-plan display-policy validation. Deprecated `strategic-reinvention` normalizes to `veronicabenini` at canonical-manifest construction.

## Changed paths

- `packages/source-ingestion/src/content-source.ts`
- `packages/source-ingestion/src/index.ts`
- `packages/source-ingestion/src/content-source.unit.test.ts`
- `packages/veronica-media/src/ingestion/secure-ingest.ts`
- `packages/veronica-media/src/ingestion/secure-ingest.unit.test.ts`
- `packages/veronica-media/src/contracts/media-plan.v1.ts`
- `packages/veronica-media/src/contracts/media-plan.v1.unit.test.ts`

## Checks

- `pnpm test:focused -- packages/veronica-media/src/ingestion/secure-ingest.unit.test.ts` — passed (5 tests).
- `pnpm test:focused -- packages/veronica-media/src/contracts/media-plan.v1.unit.test.ts` — passed (3 tests).
- `pnpm --filter @mediaforge/veronica-media typecheck` — passed.
- `pnpm test:focused -- packages/source-ingestion/src/content-source.unit.test.ts` — passed (5 tests) after building the local shared package entrypoint.

## Risks and follow-up

No persistence wiring was added (outside VRI-03 ownership). Commit base: `dcd7d4d`.
