# Harden Veronica Short pre-image planning and QA

Date: 2026-08-11

## Changed files

- `packages/domain/src/index.ts`
- `packages/image-generation/src/episode-image-pipeline.ts`
- `packages/image-generation/src/episode-image-pipeline.unit.test.ts`
- `packages/strategic-reinvention/src/index.ts`
- `packages/strategic-reinvention/src/positioning-production-adapter.ts`
- `packages/strategic-reinvention/src/positioning-visual-contracts.ts`
- `packages/strategic-reinvention/src/veronica-canonical-timing.ts`
- `packages/strategic-reinvention/src/veronica-canonical-timing.unit.test.ts`
- `packages/strategic-reinvention/src/veronica-image-prompt-compiler.ts`
- `packages/strategic-reinvention/src/veronica-image-prompt-compiler.unit.test.ts`
- `packages/strategic-reinvention/src/veronica-pre-image-semantic-gate.ts`
- `packages/strategic-reinvention/src/veronica-pre-image-semantic-gate.unit.test.ts`
- `packages/strategic-reinvention/src/veronica-provider-image-prompt-artifact.ts`
- `packages/strategic-reinvention/src/veronica-semantic-quality.ts`

## Summary

Implemented typed canonical-audio timing provenance and timestamp/silence/fallback alignment; typed Veronica actor ownership and canonical-reference invariants; materialized provider-prompt semantic adjudication with actionable blockers; and deterministic semantic crop/event planning without increasing generated-image count. Provider artifacts now preserve semantic-QA and reference provenance. No narration, TTS, image, provider-selection, cache, or retry policy was changed.

## Tests and checks

- `pnpm --dir packages/strategic-reinvention typecheck` — PASS.
- Focused Vitest run for canonical timing, semantic gate, prompt compiler, production adapter, and image pipeline — BLOCKED after 57 tests passed. Exact failure: `positioning production adapter > runs full-form planning through the same semantic finalizer without Short cadence`; expected one `DECISIVE_TRANSITION_MOMENT`, received two `SINGLE_STATE` values.
- Exact temporal-parser repair test — PASS (1 passed, 45 skipped).
- `git diff --check` — PASS.

## Risks and follow-up

The remaining focused failure is in long-form state-complexity classification, likely owned by `resolveFinalStateComplexity` / semantic proposition derivation. Verification reached the repository retry budget, so no further repair was attempted. Per the requested gate, L06-S01 was not replanned and no pre-image pack was regenerated or evaluated. No paid OpenAI, TTS, or image calls were made. Next: diagnose that one test in a fresh verification budget, rerun the five focused files, then replan and inspect L06-S01.
