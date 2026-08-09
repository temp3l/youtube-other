# Workspace capabilities API

Summary: added a tenant-scoped, fail-closed workspace capability read endpoint backed only by persisted configuration. The SDK and settings BFF now consume it; missing tenant configuration returns not found instead of pilot defaults.

Changed paths: platform OpenAPI/API use case, SDK operation/client, and web BFF/settings demo/test adapters.

Checks: API typecheck, API SDK build, and web typecheck passed.

Risks: episode resolved-configuration SDK/BFF route and workflow-form locale replacement remain. The existing workflow form still contains its pilot locale mapping and must not be extended.

Follow-up: expose episode resolution, use it in workflow admission UI, then implement YSAAS-020 step-up confirmation.
