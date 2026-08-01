# Codex Run: API Task 25 — Reconciliation Process Role

## Summary

Added an independently runnable, tenant-bound YouTube reconciliation process. It drains ready work, polls only while idle, shuts down on signals, closes PostgreSQL reliably, validates bounded role settings, and limits provider recovery searches to the authenticated channel owner.

## Changed Paths

- `apps/api/src/{reconciliation-entry,reconciliation-process*}.ts`
- `apps/api/src/index.ts`, `apps/api/package.json`
- `packages/youtube-upload/src/publication-reconciliation*`
- `docs/development/configuration.md`
- this report

## Tests

- `pnpm test:focused -- apps/api/src/reconciliation-process.unit.test.ts` — 4 passed.
- `pnpm test:focused -- packages/youtube-upload/src/publication-reconciliation.unit.test.ts` — 2 passed.
- `pnpm --filter @mediaforge/api --filter @mediaforge/youtube-upload typecheck` — passed.
- Targeted Prettier and `git diff --check` — passed.

## Commit Hash

`HEAD` (the commit containing this report).

## Unresolved Risks

Live OAuth/YouTube execution remains environment-gated. Deployment must run one explicitly configured process per tenant credential grant and supervise process restarts.
