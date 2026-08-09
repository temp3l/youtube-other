# YSAAS-022 onboarding and search

Summary: Added server-rendered onboarding readiness, v1 episode search, and an action center sourced from canonical production-state actions. Search uses only tenant-scoped project/episode reads and matches title or ID; it does not index artifacts, provider payloads, or other workspaces.

Changed paths: `apps/web/src/saas-runtime.ts`.

Checks: `pnpm --filter @mediaforge/web typecheck` passed.

Commits: `af66cab`, `3cb83e9`.

Risks: Action-center retention, membership UI, lifecycle confirmation screens, and provider/channel handoffs lack the required backend/BFF contracts and remain incomplete.
