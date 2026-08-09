# YSAAS-022 onboarding and search

Summary: Added server-rendered onboarding readiness and v1 episode search. Search uses only tenant-scoped project/episode reads and matches title or ID; it does not index artifacts, provider payloads, or other workspaces.

Changed paths: `apps/web/src/saas-runtime.ts`.

Checks: `pnpm --filter @mediaforge/web typecheck` passed.

Commit: `af66cab`.

Risks: Action-center retention, membership UI, lifecycle confirmation screens, and provider/channel handoffs lack the required backend/BFF contracts and remain incomplete.
