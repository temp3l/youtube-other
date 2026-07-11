# Full Story Repair And Validation

Summary: Added one validator-guided repair attempt for failed English and localized full-story responses. The repair keeps the full response schema and receives the exact validation failures; only outputs that pass afterward reach canonical persistence and the existing cache writes.

Changed paths: `packages/story-localization/src/story-localization.service.ts`, `packages/story-localization/src/generated-story-validator.ts`, `packages/story-localization/src/character-rename.service.ts`, `packages/story-localization/src/generated-story-validator.unit.test.ts`, and this report.

Checks: `generated-story-validator.unit.test.ts` passed (22 tests); the story-localization package build passed; `git diff --check` passed. The exact localized-short fixture test remains pre-existingly broken because its mock supplies an `es` payload to English generation, so no failed-localization report is created.

Risks/follow-up: semantic immutable-fact checks use salient token anchors, not full natural-language equivalence. Cache keys and cache-write locations were not changed; run a provider-backed Episode 036 retry in the detached session to validate the repair flow end to end.
