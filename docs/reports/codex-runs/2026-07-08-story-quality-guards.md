Summary: Added fail-fast protection for empty full-story prompts and tightened story quality validation for abstract outline prose, late setup after endings, and localized English placeholder leakage.

Changed paths: `packages/story-localization/src/story-localization.service.ts`, `packages/story-localization/src/story-prompt-module-registry.ts`, `packages/story-localization/src/story-prompt-compiler.ts`, `packages/story-localization/src/generated-story-validator.ts`, `packages/story-localization/src/generated-story-validator.unit.test.ts`, `packages/story-localization/src/story-prompt-compiler.unit.test.ts`, `packages/story-localization/dist/*`

Tests/checks: `pnpm test:focused -- packages/story-localization/src/generated-story-validator.unit.test.ts`; `pnpm test:focused -- packages/story-localization/src/story-prompt-compiler.unit.test.ts`; `pnpm --filter @mediaforge/story-localization typecheck`; `pnpm --filter @mediaforge/story-localization build`

Results: All listed checks passed. A narrower integration attempt for `story-localization.integration.test.ts` still failed on an existing fixture mismatch: `Character names are missing.`

Risks remaining: Broad integration fixtures need reconciliation with the current character-renaming contract. Episode 026 scripts were not regenerated in this task to avoid another paid provider call.

Follow-up: Regenerate episode 026 from the corrected pipeline after fixing or updating the integration fixture expectations.
