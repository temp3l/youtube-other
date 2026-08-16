# MICRO-036 bounded E004-E010 batch

**Date:** 2026-08-12  
**Task:** MICRO-036 — Produce bounded E004-E010 batch

## Summary

Implemented bounded batch authorization, preflight, and execute for episodes E004–E010 across en-US, de-DE, es-ES, and pt-BR. EN episodes generate TTS, visuals, and renders; other locales reuse EN visuals from the batch output root. Prep requires MICRO-035 execution evidence and pack script hash verification.

## Files changed

- `packages/microdrama/src/micro-036-*.ts`, `e004-e010-bounded-batch-preflight.ts`
- `packages/microdrama/src/index.ts`
- `scripts/microdrama-prepare-micro-036-batch-authorization.ts`
- `scripts/microdrama-execute-micro-036-batch.ts`
- `docs/tasks/microdrama/implementation-backlog.json`

## Validation

```bash
pnpm exec vitest run -c vitest.integration.config.ts \
  packages/microdrama/src/micro-036-bounded-batch-execute.integration.test.ts \
  -t "authorizes and executes bounded E004-E010"
```

**Result:** PASS (28 outputs, E011 blocked)

## Operator execute

`pnpm exec tsx scripts/microdrama-execute-micro-036-batch.ts` — **DONE** (983 requests, $61.28, 147 shared-visual cache hits, ~2 min mock). Evidence: `docs/reports/codex-runs/2026-08-12-micro-036-batch-execution-evidence.json`. Artifacts: `.artifacts/microdrama/micro-036-batch/`.

## Risks

Operator prep/execute requires live MICRO-035 evidence in `.mediaforge.sqlite`. Cost ceiling 9999 minor is planning-only until measured operator runs.
