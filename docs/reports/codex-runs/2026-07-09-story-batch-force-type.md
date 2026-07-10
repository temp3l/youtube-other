Summary: Added the missing `force` property to `StoryBatchCliOptions` so story batch commands match their registered `--force` flag usage and `buildBatchConfig()` compiles cleanly again.

Changed paths:
- `apps/cli/src/story-localization-commands.ts`

Tests:
- `pnpm --filter @mediaforge/cli typecheck` ✅

Commit hash:
- `9e3ba734272ae430efca0a09bda11912bbc254a6`

Unresolved risks:
- This verifies the CLI package typecheck only; no runtime batch command execution was exercised in this run.
