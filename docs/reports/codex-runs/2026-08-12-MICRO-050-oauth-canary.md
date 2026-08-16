# MICRO-050 OAuth canary

## Summary
Implemented read-only TikTok OAuth canary: fixture bindings, `EXACT_READ_ONLY_PROVIDER_ACCESS` operator auth, preflight (`TIKTOK_APP_AUDIT_READY`), bounded prep/authorize/execute with fixture ports, evidence projection (`status: DONE`), and CLI scripts. Zero publication calls.

## Changed paths
- `packages/microdrama/src/micro-050-*.ts`
- `packages/microdrama/src/index.ts`
- `scripts/microdrama-prepare-micro-050-oauth-canary.ts`
- `scripts/microdrama-execute-micro-050-oauth-canary.ts`
- `packages/microdrama/package.json`
- `vitest.integration.config.ts`
- `docs/tasks/microdrama/implementation-backlog.json`

## Tests
`pnpm exec vitest run -c vitest.integration.config.ts packages/microdrama/src/micro-050-tiktok-oauth-canary-execute.integration.test.ts -t "authorizes and executes"` — **PASS**

## Risks
Operator prep test requires `MICRO_050_OPERATOR_PREP=1` and writes to `.mediaforge.sqlite`.
