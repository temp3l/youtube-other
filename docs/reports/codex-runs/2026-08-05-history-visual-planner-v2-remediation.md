# History visual planner v2 remediation

Summary: Added an opt-in, History-only v2 planner with narration integrity, variable timing, evidence-aware assets, map/diagram states, 16:9/9:16 derivatives, measured-audio reconciliation, and hash-bound diagnostics/approvals. v1 remains default and unchanged.

Changed paths: `packages/history/src/{visual-planner-v2,index,task-registry,content-pack}.ts`, `apps/cli/src/{index,history-commands,history-commands.unit.test}.ts`, `packages/history/src/visual-planner-v2.unit.test.ts`, `docs/history/overview.md`.

Tests: focused v2 planner tests (5 passed); focused History CLI tests (7 passed); `@mediaforge/history` typecheck (passed); `git diff --check` (passed).

Commit hash: not created.

Unresolved risks: measured-audio reconciliation requires a locally available audio file/ffprobe; provider generation and episode rollout were intentionally not invoked.
