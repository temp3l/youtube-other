# Codex Run: Two-Phase Cacheable Media Pipeline

## Summary

Resumed the interrupted implementation. Retry caps now inherit explicit higher-scope
primary caps, cache-hit scenes are omitted from provider batches, and strict
TypeScript contracts compile for prompt-cache planning and canonical-parent lineage.

## Changed Paths

`packages/config/src/index.ts`, `packages/image-generation/src/{image-batch-planner.ts,image-batch-planner.unit.test.ts}`, and `packages/story-localization/src/{story-localization-batch-service.ts,story-localization.service.ts}`.

## Tests

Exact cache-reuse unit test, `pnpm typecheck:affected`, targeted ESLint, and `git diff --check` passed. No provider calls occurred. Commit base: `96bc991`; changes remain uncommitted.

## Risks

Credentialed non-production verification is still needed for provider edit/file-expiry semantics. The remaining affected unit suites were not rerun after stabilization.
