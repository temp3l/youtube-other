# MICRO-022 TikTok account and OAuth domain

Date: 2026-08-12
Task: MICRO-022
Status: DONE

## Summary

Added TikTok account/OAuth contracts with official endpoint validation, OAuth state/callback binding, immutable credential versions, provider-free registration/revocation via fixture token exchange, fake repository, and application service.

## Changed paths

- `packages/domain/src/tiktok-account-*.ts`
- `packages/tiktok-publishing/**`
- `packages/application/src/tiktok-account-service.ts`
- `vitest.unit.config.ts`
- `docs/tasks/microdrama/implementation-backlog.json`

## Validation

- `pnpm test:focused -- packages/tiktok-publishing/src/tiktok-account-oauth.unit.test.ts` — 4 passed
- `pnpm test:focused -- packages/domain/src/tiktok-account-lifecycle.unit.test.ts` — 5 passed

## Risks

- Secure credential persistence deferred to MICRO-023; handles are opaque only.

## Backlog

- MICRO-022 → DONE
- MICRO-023 → READY
