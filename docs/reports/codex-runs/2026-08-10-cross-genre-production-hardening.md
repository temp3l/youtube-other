# Cross-genre production hardening

## Summary

Status: PARTIAL. Added shared typed semantic, actor/state, diversity, reuse, timing, review, provider-gate, invalidation, observability, and adaptive-pacing primitives; added History/DarkTruth adapters and four offline fixture runs; fixed DarkTruth Short 9:16 projection. History lacks a dedicated Short narration/planning path, and hardening artifacts are not yet mandatory canonical-task dependencies.

## Changed paths

- `packages/shared/src/production-hardening*`
- `packages/speech/src/adaptive-pacing*`, Veronica pacing wrapper
- `packages/history/src/history-production-hardening*`
- `packages/dark-truth/src/production-hardening*`, `index.ts`
- `scripts/cross-genre-production-hardening-dry-run.ts`
- `docs/audits/cross-genre-production-hardening-adoption-2026-08-10.md`
- four JSON artifacts under the sibling hardening-artifacts directory

## Checks

Focused Vitest passed: shared 10, generic pacing 3, Veronica pacing 6, History 2, DarkTruth 3. Builds/typechecks passed for shared, speech, History, DarkTruth. Targeted ESLint passed. Four offline dry runs passed. Live TTS calls: 0. Image calls: 0.

## Risks/follow-up

Wire hardening/review hashes into canonical provider tasks; create a real History Short workflow; genericize post-generation pixel QA separately.
