# Episode configuration BFF

Summary: added the resolved episode configuration API/SDK/BFF route and removed the workflow form’s pilot locale map. Selectable locales now come only from persisted, server-resolved configuration.

Changed paths: artifact lineage OpenAPI component/path, API SDK operation/client, and web BFF/runtime/demo/test adapters.

Checks: API SDK build and web typecheck passed.

Risks: the API contract applies fail-closed resolution, but its OpenAPI component is intentionally read-only; tenant configuration provisioning remains operator-owned.

Follow-up: begin YSAAS-020 with persisted, action-bound recent-auth confirmation before adding integration mutations.
