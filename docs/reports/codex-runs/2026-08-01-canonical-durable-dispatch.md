# Canonical Durable Dispatch

Changed files: `packages/application/src/canonical-durable-workflow-executor.ts`, its unit test, and the application barrel export.

Implemented a fixed, exact-command durable executor registry. It rejects invalid command identities, duplicate bindings, unsupported persisted commands, and execution/run command mismatches before delegating the original mode, job, control, and run unchanged.

Checks: `pnpm exec vitest run -c vitest.unit.config.ts --bail=1 packages/application/src/canonical-durable-workflow-executor.unit.test.ts` — passed (2 tests).

Commit hash: `HEAD` (commit containing this report).

Risk/follow-up: production composition must inject approved command bindings; no API or CLI wiring was added here.
