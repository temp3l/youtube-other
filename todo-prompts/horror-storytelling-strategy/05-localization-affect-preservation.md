# Task 05 — Localization Affect Preservation

Implement only this task after Task 04. Extend the existing localization path;
do not create locale-specific story generation. Follow this folder's README.

## Goal

Preserve the accepted affect architecture across localized full stories while
allowing natural language rhythm and culturally appropriate phrasing.

## Inspect First

- `packages/story-localization/src/localization-prompt-builder.ts`
- `packages/story-localization/src/localization-fidelity.ts`
- `packages/story-localization/src/story-localization.service.ts`
- `packages/story-localization/src/story-localization-batch-service.ts`
- `packages/story-localization/src/story-localization.schemas.ts`
- `packages/story-localization/src/story-localization.types.ts`
- `packages/story-localization/src/full-story-contract.ts`
- `packages/story-localization/src/generated-story-validator.ts`
- `packages/story-localization/src/story-localization.unit.test.ts`

## Required Work

1. Define a compact, versioned localization projection referencing accepted
   question, rule/mechanic, response, cost, climax, and payoff IDs.
2. Carry semantic invariants and protected facts, not English sentence
   templates. Locale output may change syntax, cadence, idiom, and paragraph
   rhythm.
3. Add projection instructions to the existing localized-full prompt only in
   enforce mode. Off/shadow must preserve today's request and cache behavior.
4. Extend fidelity checks to detect missing or contradictory affect transitions
   with evidence references. Keep source-fidelity and lineage failures dominant.
5. Never let a locale introduce a new threat rule, surprise, immutable fact, or
   ending. Preserve rename maps, canonical identities, and accepted final-line
   semantics.
6. Version and fingerprint the projection only when it is enforced. Propagate
   parent plan lineage and explain stale localized artifacts.
7. Ensure synchronous and batch localization compile equivalent requests.

## Focused Verification

- Add localization prompt/fidelity tests for preserved IDs and meaning with
  substantially different wording.
- Add negative fixtures for missing response, changed rule, unearned surprise,
  and altered payoff.
- Re-run the narrow final-line, Unicode, rename-map, cache, and sync/batch tests
  affected by the change.
- Stay within three focused commands plus one package typecheck.

## Acceptance Criteria

- Localization preserves affect causality without literal translation.
- Deterministic source/lineage failures cannot be cleared by a subjective score.
- No new provider call or locale-specific plot invention is introduced.
- Existing behavior remains unchanged in off/shadow.
- Failures name evidence and the owning semantic IDs.
