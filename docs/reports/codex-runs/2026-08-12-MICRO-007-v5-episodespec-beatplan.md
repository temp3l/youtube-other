# MICRO-007 V5 EpisodeSpec and BeatPlan

Date: 2026-08-12
Task: MICRO-007
Status: DONE

## Summary

Added narrative-core EpisodeSpec/BeatPlan contracts, a V5 compiler that projects accepted canon boundaries and EN timing into 100 typed production records without rolling planning, and a story-localization lineage adapter that binds revision IDs while keeping prose on ScriptRevision artifacts.

## Files changed

- `packages/narrative-core/src/episode-production.ts`
- `packages/narrative-core/src/revision.ts`
- `packages/narrative-core/src/index.ts`
- `packages/microdrama/src/v5-episode-production-contracts.ts`
- `packages/microdrama/src/v5-episode-production-compiler.ts`
- `packages/microdrama/src/v5-episode-production-compiler.unit.test.ts`
- `packages/microdrama/src/index.ts`
- `packages/story-localization/src/microdrama-script-lineage.ts`
- `packages/story-localization/src/microdrama-script-lineage.unit.test.ts`
- `packages/story-localization/package.json`
- `packages/story-localization/src/index.ts`
- `docs/tasks/microdrama/implementation-backlog.json`

## Validation

- `pnpm test:focused -- packages/microdrama/src/v5-episode-production-compiler.unit.test.ts` — 3 passed
- `pnpm test:focused -- packages/story-localization/src/microdrama-script-lineage.unit.test.ts` — 1 passed
- `pnpm --filter @mediaforge/narrative-core typecheck` — pass

## Risks

- Downstream package typechecks require rebuilding `@mediaforge/narrative-core` dist before CI compile steps.
- Cliffhanger taxonomy inference is keyword-heuristic over accepted EN boundary text; semantic QA remains MICRO-008.
