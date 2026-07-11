# Canonical Facts Name Extraction

Summary: Updated canonical fact extraction so a leading temporal or subordinate-clause word is not treated as part of a person's name. `Once Nina understood…` now contributes only the real named character, such as `Nina Bell`, instead of creating `Once Nina`. Full validation now applies the character rename map to the story IR, and full-story word-range tolerance permits up to 25% expansion. Episode 036 generation was executed from a detached `tmux` session, so tool-session termination no longer interrupts persistence.

Changed paths: `packages/story-localization/src/canonical-facts.service.ts`, `packages/story-localization/src/generated-story-validator.ts`, `packages/story-localization/src/story-prompt-compiler.ts`, `packages/story-localization/src/story-localization.service.ts`, `packages/story-localization/src/story-localization-batch-service.ts`, `packages/story-localization/src/story-localization.unit.test.ts`, and this report.

Checks: the exact name-extraction regression passed; `packages/story-localization/src/generated-story-validator.unit.test.ts` passed (18 tests); and `pnpm --filter @mediaforge/story-localization build` passed. The full localization helper file has one unrelated pre-existing fixture failure: its localized-short retry test expects a failed-localization report that was not written.

Risks/follow-up: runtime `dist` is rebuilt and the detached session completed. Fresh English provider outputs still fail validation: the latest was 1,551 words against a 1,473-word cap, did not satisfy immutable-fact matching, and leaked the original alias `Bell`. No localized output was written and no old artifact was copied. Repair the prompt/validator contract rather than weakening the gates further.
