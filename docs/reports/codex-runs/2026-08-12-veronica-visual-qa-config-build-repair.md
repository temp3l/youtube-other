# Veronica Visual QA Config Build Repair

- Changed files: `packages/image-generation/src/veronica-post-generation-visual-qa.ts`; this report.
- Summary: declared the supported optional evaluator configuration keys after merging the defaults with external config, allowing `reasoningEffort` to be narrowed and passed to the Responses API.
- Checks: `pnpm --filter @mediaforge/image-generation build` (two targeted attempts).
- Result: passed.
- Commit: not created.
- Remaining risk: no runtime API call was made; the change is type-only and preserves existing runtime validation.
