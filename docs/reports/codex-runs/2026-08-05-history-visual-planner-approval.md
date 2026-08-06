# History visual planner approval

Summary: added History-only visual planning, validated draft artifacts, and hash-bound approval before image generation.

Operator action: the canonical Napoleon plan `960e8911280951738ab339338ae71a7ea859f64c3b593e0bd0525fce859f81fe` was explicitly approved on 2026-08-05.

Changed paths: `packages/history/src/visual-planner.ts`, `packages/history/src/task-registry.ts`, `packages/history/src/index.ts`, `apps/cli/src/{index,history-commands}.ts`, their unit tests, and `docs/history/overview.md`.

Tests: `pnpm test:focused -- packages/history/src/visual-planner.unit.test.ts apps/cli/src/history-commands.unit.test.ts` (8 passed); `pnpm --filter @mediaforge/history typecheck`, `pnpm --filter @mediaforge/history build`, and `pnpm --filter @mediaforge/cli build` (passed). `pnpm mediaforge history visuals --help` confirmed the packaged command.

Commit hash: not created.

Unresolved risks: OpenAI strategy enrichment and downstream History rendering enforcement remain for Goal 2; the current planner is deterministic and intentionally makes no media-provider call.
