# YSAAS-021 publishing frontend

## Changed files
- `apps/web/src/saas-runtime.ts` and BFF gateway modules
- `packages/api-sdk/src/index.ts`
- `apps/web/src/saas-runtime.unit.test.ts`

## Checks
- `pnpm test:focused -- apps/web/src/saas-runtime.unit.test.ts` — 4 passed
- `pnpm --filter @mediaforge/api-sdk build` — passed
- `pnpm exec tsc -p apps/web --noEmit` — passed

## Result
The server-rendered BFF has channel connection/status controls, immutable
preflight-and-prepare confirmation, status/schedule/cancel views, and safe
reconciliation guidance. The platform flag defaults off and renders no browser
publish control or provider credential. Metadata changes create a new immutable
intent and retain the existing assets rather than regenerating media.

## Risks and follow-up
The API has no browser execution endpoint by design; a controlled internal
worker remains the only future executor. OAuth callback completion and a richer
approval/artifact picker need later API projections.
