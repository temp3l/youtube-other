# API credential rotation prerequisite

## Changed files

- Added bounded rotation input and the authenticated rotation use case.
- Added an ETag- and idempotency-protected HTTP/OpenAPI endpoint plus SDK client method.
- Updated OpenAPI composition to use the registered path modules and added focused integration coverage.

## Checks

- `pnpm exec vitest run -c vitest.integration.config.ts --bail=1 apps/api/src/http-server.integration.test.ts -t 'rotates a credential'` — passed (1 test).
- `pnpm --filter @mediaforge/domain build` — passed.
- `pnpm --filter @mediaforge/api-sdk build` — passed before the final domain export change.

## Risks and follow-up

The endpoint reuses the credential issue idempotency store under a route/key namespace; replay responses intentionally omit the secret. The YSAAS-020 BFF/UI still needs step-up confirmation, one-time secret rendering, and webhook management.
