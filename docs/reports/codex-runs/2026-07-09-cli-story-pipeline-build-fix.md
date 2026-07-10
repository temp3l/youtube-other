# Codex Run Report

Summary: Fixed the CLI `stories pipeline` build failure by preserving the validated workflow manifest as `StoryWorkflowManifest` after schema parsing, avoiding a widened optional `locale` shape from the schema-inferred type.

Changed paths:
- `apps/cli/src/story-pipeline-command.ts`

Tests:
- `pnpm exec tsc -p apps/cli/tsconfig.json`

Commit hash: `0888508`

Unresolved risks:
- This only addresses the reported CLI manifest typing mismatch; no broader CLI test coverage was run.
