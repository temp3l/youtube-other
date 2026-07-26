# Hybrid Render Task 04: SSH Operations

Date: 2026-07-26
Commit: `b0286bd044b76dda679f08744f59e005e25a8377`

Summary: Added shared typed story/math remote configuration, immutable math
image deployment receipts, strict SSH/rsync transport, local/remote identity
preflight, contained content-addressed shard staging, atomic ready publication,
bounded status/log parsing, fragment hash/length promotion, and guarded
retention cleanup. Registered `math renderer remote deploy|check|status|logs|cleanup`.
Task 05 workflow scheduling was not started.

Changed paths:
- `packages/config/src/index{,.unit.test}.ts`
- `apps/cli/src/{index,math-commands,math-render-remote,math-render-remote.unit.test}.ts`
- `docs/development/commands.md`
- this report

Checks:
- Config/shell/inspection focused tests: passed, 23 tests.
- Deployment/transport focused test: passed, 13 tests; stale-dist resolution
  and cleanup-shell syntax were repaired within two reruns.
- `pnpm --filter @mediaforge/cli typecheck`: passed.

Risks: No real SSH, VPS Docker load, remote cleanup, or render was run. Live
host validation remains explicitly operator-authorized Task 07 work.

Follow-up: Start Task 05 separately.
