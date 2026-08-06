# History OpenAI timeout 10m

Summary: default History V3.3 OpenAI client/provider timeout raised from 5m to
10m (`OPENAI_HISTORY_TIMEOUT_MS` still overrides).

Changed: `packages/history/src/history-research-v33.ts`, `apps/cli/src/index.ts`.

Tests: `pnpm --filter @mediaforge/history build`, `pnpm --filter @mediaforge/cli build` — pass.

Risks: none beyond longer hung-call waits before abort.
