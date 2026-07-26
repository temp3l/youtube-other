# Task 04 — Short Affect-Plan Projection

Implement only this task after Tasks 01–03. Reuse the current Short rewrite
pipeline and follow this folder's `README.md`.

## Goal

Project one coherent, accepted question-to-payoff chain from the full-story
affect plan into Shorts. Do not invent a second horror architecture.

## Inspect First

- `packages/story-localization/src/horror-affect-plan.ts`
- `packages/story-localization/src/short-rewrite.prompt.ts`
- `packages/story-localization/src/short-rewrite.schemas.ts`
- `packages/story-localization/src/short-rewrite.types.ts`
- `packages/story-localization/src/short-rewrite.service.ts`
- `packages/story-localization/src/short-rewrite.persistence.ts`
- `packages/story-localization/src/generated-story-validator.ts`
- `packages/story-localization/src/story-workflow-shorts.ts`
- `apps/cli/src/story-short-rewrite-command.ts`

## Required Work

1. Add a strict, versioned Short projection derived only from an accepted,
   current full-story plan.
2. Select exactly one central question, one relevant rule/mechanic, at least one
   credible response or proof step, one cost, and the accepted consequence or
   payoff. Preserve their source/beat IDs.
3. Fail closed when the selected chain is unsupported, causally incomplete, or
   depends on omitted immutable facts. Do not manufacture bridging facts.
4. Add a compact Short-owned prompt section. Preserve narration-only output,
   word/duration budgets, hook rules, final-sting rules, Unicode, and rename
   maps.
5. Respect rollout:
   - off/shadow must not alter the provider request or accepted Short identity;
   - enforce may add the projection and its versions/hash to fingerprints.
6. Persist projection lineage through existing Short artifact/cache contracts.
   Explain staleness when the parent plan or selected IDs change.
7. Ensure Short repair/regeneration cannot silently select a different chain.

## Focused Verification

- Add projection unit tests for deterministic selection, causal closure,
  unsupported mechanics, missing payoff, and stable hashes.
- Extend Short prompt/service tests for mode semantics, prompt ownership, cache
  identity, parent-plan staleness, and final-line/rename-map preservation.
- Run at most three focused test commands and one affected-package typecheck.

## Acceptance Criteria

- The Short is a compression of accepted full-story affect structure.
- No extra provider request is introduced.
- Fixed inputs produce byte-stable projection and prompt output.
- Incomplete projections block locally before a paid call in enforce mode.
- Existing Short behavior is byte-for-byte unchanged in off/shadow modes.
