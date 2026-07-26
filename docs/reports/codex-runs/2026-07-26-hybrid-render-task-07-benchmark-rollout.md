# Hybrid Render Task 07: Provider-Free Benchmark Rollout

Commit: `8991a79`

Summary: Added `math renderer benchmark`, strict hashed input/output artifacts,
eight isolated cold/warm case orchestration, explicit unavailable measurements,
ratio/speedup/overlap gates, local-container support, target redaction, safe
configuration examples, and remote-math operations documentation. Local remains
the default.

Changed paths: `.env.example`; `apps/cli/src/math-{commands,render-benchmark,render-hybrid,render-remote,workflow-runtime}*`;
`packages/{config,math-rendering}/**`; relevant architecture, commands, remote
operations docs; this report.

Checks:
- `pnpm test:focused -- apps/cli/src/math-private-batch-scheduler.unit.test.ts` — 5 passed.
- `pnpm test:focused -- apps/cli/src/math-commands.unit.test.ts -t "keeps private batch run and resume behind both aggregate cost ceilings before any provider or render work"` — 1 passed.
- `pnpm --filter @mediaforge/cli typecheck` — passed.
- `pnpm test:focused -- apps/cli/src/math-render-benchmark.unit.test.ts` — stale-dist failure, then 2 passed after source binding.
- Targeted ESLint — new files passed; pre-existing `math-render-remote.ts:132` escape finding remained.
- `git diff --check` — passed.

Unresolved risks: No image ID, infrastructure timing/ratio, cache/transfer, media output,
scene assignment, overlap, failure reassignment, Docker, SSH, VPS, provider,
publish, or default-executor change was measured or performed.
