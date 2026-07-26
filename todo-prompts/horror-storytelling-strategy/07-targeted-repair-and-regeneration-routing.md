# Task 07 — Targeted Repair And Regeneration Routing

Implement only this task after Analysis V2 has stable evidence tests. Reuse the
existing repair and retry machinery and follow this folder's `README.md`.

## Goal

Repair local affect failures narrowly when evidence identifies safe editable
beats, and route cross-story architecture failures to full regeneration.

## Inspect First

- `packages/story-localization/src/story-retry-routing.ts`
- `packages/story-localization/src/story-generation-contracts.ts`
- `packages/story-localization/src/story-quality-repair.ts`
- `packages/story-localization/src/generated-story-validator.ts`
- `packages/story-localization/src/story-localization-batch-service.ts`
- `packages/story-localization/src/short-rewrite.prompt.ts`
- `packages/story-localization/src/story-production-analysis.ts`
- focused repair, retry-routing, and service tests

## Required Work

1. Add typed affect issue codes and repair scopes only for findings with valid
   evidence, modifiable beat IDs, and explicit protected facts.
2. Define narrow repair eligibility for local omissions or contradictions, such
   as a missing response step or weakened cost, when causal architecture remains
   intact.
3. Route missing central question, unsupported rule, arbitrary climax, broken
   cross-story causality, or incompatible payoff to full regeneration.
4. Build repair instructions from accepted plan fragments and evidence. Lock
   immutable facts, final line, rename maps, unaffected beats, duration/word
   budget, and narration-only output.
5. Revalidate the entire applicable contract after repair. A repair may not hide
   deterministic failures or change the selected Short/localization projection.
6. Record attempt history, issue IDs, repair scope, affected beat IDs, parent
   hashes, and final outcome using existing artifact lineage.
7. Preserve retry ceilings and cost controls. Do not add an unbounded repair
   loop or extra default model call.
8. Version prompt and routing dependencies so cache/resume behavior is explicit.

## Focused Verification

- Extend retry-routing tests with a decision table for repair, regenerate, and
  block.
- Add repair prompt/service tests proving protected content is locked and a
  local fix is fully revalidated.
- Test retry ceilings, stable history, cache invalidation, and Short projection
  preservation with mocked providers.
- Run at most three focused commands plus one package typecheck.

## Acceptance Criteria

- Only evidence-backed, beat-scoped issues use targeted repair.
- Architecture-level failures always regenerate or block.
- Protected facts and accepted ending cannot change.
- Repair results pass all original deterministic contracts.
- No unbounded cost path or live provider verification exists.
