# MICRO-017 locale subtitles and UI projections

Date: 2026-08-12
Task: MICRO-017
Status: DONE

## Goal

Derive locale-aware subtitle and Signal UI artifacts from selected audio and typed state.

## Files changed

- `packages/domain/src/selected-audio-timing-dependency.ts`
- `packages/domain/src/locale-subtitle-projection.ts`
- `packages/domain/src/signal-ui-locale-projection.ts`
- `packages/domain/src/index.ts`
- `packages/alignment/src/locale-subtitle-projection.ts`
- `packages/alignment/src/index.ts`
- `packages/rendering/src/locale-subtitle-artifact.ts`
- `packages/rendering/src/signal-ui-projection.ts`
- `packages/rendering/src/locale-subtitle-ui-projection.unit.test.ts`
- `packages/rendering/src/index.ts`
- `packages/rendering/package.json`
- `docs/tasks/microdrama/implementation-backlog.json`

## Validation

- `pnpm exec vitest run -c vitest.unit.config.ts packages/rendering/src/locale-subtitle-ui-projection.unit.test.ts` — 3 passed
- `pnpm exec vitest run -c vitest.unit.config.ts packages/domain/src/signal-ui-locale-projection.unit.test.ts packages/rendering/src/signal-ui-projection.unit.test.ts` — 6 passed

## External calls

None.

## Backlog

- MICRO-017 → DONE
- MICRO-018 → READY

## Risks

- Locale subtitle phrase grouping still uses shared English-biased stopwords in `caption-plan.ts`; dedicated locale break rules may be needed later.
