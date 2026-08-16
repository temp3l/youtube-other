# MICRO-037 TikTok private publication canary

## Summary
Implemented private TikTok publication canary chaining MICRO-034 render + MICRO-050 OAuth evidence: `EXACT_PUBLICATION_INTENT` auth, publication preflight gates, fixture Direct Post + status reconciliation, one publication call, evidence projection. Added domain effect-reference helpers for reconciliation.

## Changed paths
- `packages/microdrama/src/micro-037-*.ts`
- `packages/microdrama/src/index.ts`
- `packages/domain/src/tiktok-direct-post-contracts.ts`
- `packages/domain/src/tiktok-direct-post-lifecycle.ts`
- `scripts/microdrama-prepare-micro-037-private-publication-canary.ts`
- `scripts/microdrama-execute-micro-037-private-publication-canary.ts`
- `docs/tasks/microdrama/implementation-backlog.json`

## Tests
`pnpm exec vitest run -c vitest.integration.config.ts packages/microdrama/src/micro-037-tiktok-private-publication-canary-execute.integration.test.ts -t "authorizes and executes"` — **PASS**

## Risks
Authorize timestamp must be ≥ operator auth `authorizedAt` (prep after MICRO-050 execute). Domain `buildTikTokDirectPostEffectReference` unit tests still use legacy init-request shape.
