# YSAAS-020 integrations completion

Implementation commit: `07b052b`

Changed paths: `apps/web/src/{saas-runtime.ts,saas-api-bff.ts,saas-modules/api-sdk-gateway.ts,oidc-bff.ts}`; `packages/api-sdk/src/{index.ts,index.unit.test.ts}`; `packages/persistence/src/{index.ts,recent-auth-confirmation-adapter.ts,recent-auth-confirmation-adapter.unit.test.ts}`; plan ledger and implementation report.

Checks: `pnpm test:focused -- packages/persistence/src/recent-auth-confirmation-adapter.unit.test.ts`; `pnpm test:focused -- packages/api-sdk/src/index.unit.test.ts`; API SDK build; web typecheck.

Results: both focused suites, SDK build, and web typecheck passed.

Risks/follow-up: this repository has no production server-composition entrypoint; deployers must pass the exported adapter's recorder to OIDC and consumer to `createSaasRuntime`. Full BFF browser-flow tests remain unrun because this sandbox forbids loopback binds (`EPERM`).
