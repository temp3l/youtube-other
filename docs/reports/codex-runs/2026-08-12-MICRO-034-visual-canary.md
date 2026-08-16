# MICRO-034 visual canary

Task: MICRO-034 — EN E001–E003 visual production canary (MICRO-033 pattern).

## Summary

Added bounded visual canary bindings, MICRO-033 evidence loader, authorization persistence, explicit execute auth, preflight gates, mock visual ports, authorize/execute pipeline, CLI scripts, and integration tests.

Later: wired OpenAI live image provider + `--live-images` / `--episodes` operator flags. E001 regenerated with live plates (see `2026-08-12-MICRO-034-live-images.md`).

## Changed paths

`packages/microdrama/src/micro-034-*.ts`, `en-e001-e003-visual-canary-preflight.ts`, `scripts/microdrama-prepare-micro-034-authorization.ts`, `scripts/microdrama-execute-micro-034-canary.ts`, `packages/microdrama/src/index.ts`, `vitest.integration.config.ts`, `docs/tasks/microdrama/implementation-backlog.json`, `packages/image-generation/src/microdrama-visual-generation/openai-adapter.ts`

## Test

`pnpm test:focused -- packages/microdrama/src/micro-034-bounded-visual-canary-execute.integration.test.ts -t "authorizes and executes"` — **PASS** (exit 0, ~3.5s)

## Operator execute

`pnpm exec tsx scripts/microdrama-execute-micro-034-canary.ts` — **DONE** (mock plates; evidence `…-micro-034-canary-execution-evidence.json`).

Live E001: `pnpm exec tsx scripts/microdrama-execute-micro-034-canary.ts --live-images --episodes E001` — **DONE** (evidence `…-micro-034-live-image-canary-execution-evidence.json`).

## Risks

E002/E003 may still be mock plates until re-run with `--live-images`. Vitest worker RPC timeout may appear on long operator runs despite pass.
