# YSAAS-022 onboarding and search

Summary: Added server-rendered onboarding readiness, v1 episode search, and an action center sourced from canonical production-state actions. The action center now also displays only last-30-day tenant audit facts and omits raw audit payloads. Search uses only tenant-scoped project/episode reads and matches title or ID; it does not index artifacts, provider payloads, or other workspaces.

Changed paths: `apps/web/src/saas-runtime.ts`, `apps/web/src/saas-runtime.unit.test.ts`.

Checks: `pnpm --filter @mediaforge/web typecheck` passed. `pnpm test:focused -- apps/web/src/saas-runtime.unit.test.ts` passed (4).

Commits: `af66cab`, `3cb83e9`, `cdafcfe`.

Risks: Membership UI, a paginated canonical action-event read model, lifecycle confirmation screens, and provider/channel handoffs lack the required backend/BFF contracts and remain incomplete. The BFF displays only the current audit page; it does not claim exhaustive audit retention.
