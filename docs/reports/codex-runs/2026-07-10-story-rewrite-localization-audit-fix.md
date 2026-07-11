# Story Rewrite Localization Audit Fix

Date: 2026-07-10

Changed files: `story-quality-gate.ts`, `generated-story-validator.ts`, `story-markdown-renderer.ts`, `story-localization-batch-service.ts`, `story-generation-contracts.ts`, prompt/schema version files, focused unit tests, audit plan.

Root causes: renderer trusted model-supplied instructions/durations; validators missed near-duplicate localized motif blocks, scaffolding prose, unresolved rule alternatives, and copied short metadata. Existing Episode 034/030 artifacts show stale English narrator instructions and prompt/planning text in narration.

Fixes: deterministic language instructions, derived word/duration metrics, stronger contamination/repetition/compression/rule gates, structured finding context, batch short rendering through shared renderer, prompt/schema version bumps for cache invalidation.

Tests/checks: `pnpm test:focused -- packages/story-localization/src/story-quality-gate.unit.test.ts packages/story-localization/src/story-markdown-renderer.unit.test.ts packages/story-localization/src/generated-story-validator.unit.test.ts` passed, 31 tests. `pnpm --filter @mediaforge/story-localization typecheck` passed. `git diff --check -- <changed files>` passed.

Risks: no paid provider regeneration performed; existing Episode 034 artifacts remain invalid until regenerated/repaired through the hardened pipeline. `tsx` probe unavailable.
