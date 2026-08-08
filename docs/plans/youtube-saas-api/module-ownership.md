# YSAAS module ownership map

| Surface | Registry | Modules |
| --- | --- | --- |
| OpenAPI paths | `apps/api/src/contracts/openapi-registry.ts` | `apps/api/src/contracts/modules/*-paths.ts` |
| OpenAPI compose | `apps/api/src/contracts/compose-openapi.ts` | components in `openapi-components.ts` |
| SDK operations | `packages/api-sdk/src/v1-contract/registry.ts` | `packages/api-sdk/src/v1-contract/modules/*` |
| Web gateway | `apps/web/src/saas-modules/api-sdk-gateway.ts` | ownership in `page-registry.ts` |
| Web pages | `apps/web/src/saas-modules/page-registry.ts` | routes remain in `saas-runtime.ts` until YSAAS-017 |

Later tasks extend assigned module files only; central registries merge modules and must not be duplicated.
