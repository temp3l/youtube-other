# Image Batch Prompt Cache Schema Build Repair

- Changed files: `packages/image-generation/src/image-batch.schemas.ts`; this report.
- Summary: expanded the image-batch manifest prompt-cache schema to retain the current shared cache-plan fields, and backfilled token measurements when reading legacy manifests.
- Checks: `pnpm --filter @mediaforge/image-generation build` (three targeted attempts).
- Result: all original `image-batch-service.ts` TS2352 errors are resolved. The final build fails only on five pre-existing `reasoningEffort` type errors in `src/veronica-post-generation-visual-qa.ts:164-168`.
- Commit: not created.
- Remaining risk: the package cannot fully build until the unrelated Veronica settings type is reconciled.
