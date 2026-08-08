# History V3.5 episode-range review pack CLI

## Summary
Parameterized combined approval-pack generation for episode ranges, with bounded async concurrency and optional `worker_threads` per-episode CPU parallelism.

## Changed files
- `packages/history/src/history-episode-discovery.ts`
- `packages/history/src/history-approval-pack-range.ts`
- `packages/history/src/history-approval-pack-concurrency.ts`
- `packages/history/src/history-approval-pack-episode.ts`
- `packages/history/src/history-approval-pack-worker-contract.ts`
- `packages/history/src/history-approval-pack-worker.ts`
- `packages/history/src/history-approval-pack-worker-pool.ts`
- `packages/history/src/history-workflow-v35.ts`
- `scripts/history-v35-combine-episode-range.mjs`
- `apps/cli/src/history-commands.ts`
- `package.json`

## Tests
- `pnpm test:focused -- packages/history/src/history-episode-discovery.unit.test.ts` (pass)
- `pnpm test:focused -- packages/history/src/history-approval-pack-concurrency.unit.test.ts` (pass)
- `pnpm test:focused -- packages/history/src/history-approval-pack-worker-pool.unit.test.ts` (pass)

## Usage
```bash
pnpm mediaforge -- history v3.5 compare --from 11 --to 31 --json
pnpm history:v35:review-pack 11 31
pnpm history:v35:review-pack 11 31 --concurrency 4
pnpm history:v35:review-pack 11 31 --no-worker-threads
pnpm mediaforge -- history v3.5 compare --from 11 --to 31 --no-worker-threads --json
```

## Risks
- Full multi-episode regeneration not run in this session.
- Worker threads default on; falls back to in-process async pool if worker startup fails (unless `--no-worker-threads` forces main-thread-only).
