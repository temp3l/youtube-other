# MICRO-023 TikTok secure credential storage

Date: 2026-08-12
Task: MICRO-023
Status: DONE

## Summary

Added TikTok SecretStore port with in-memory and local AES-256-GCM adapters, opaque hash-based handles, credential-version keyed storage/rotation/revocation, fail-closed availability checks, and OAuth integration that persists tokens only in the secret store.

## Changed paths

- `packages/tiktok-publishing/src/tiktok-secret-store-*.ts`
- `packages/tiktok-publishing/src/local-encrypted-tiktok-secret-store.ts`
- `packages/tiktok-publishing/src/in-memory-tiktok-secret-store.ts`
- `packages/tiktok-publishing/src/tiktok-account-oauth-service.ts`
- `packages/config/src/tiktok-secret-store-config.ts`
- `packages/observability/src/log-redaction.ts`
- `packages/application/src/tiktok-account-service.ts`
- `docs/tasks/microdrama/implementation-backlog.json`

## Validation

- `pnpm exec vitest run -c vitest.unit.config.ts packages/tiktok-publishing/src/tiktok-secret-store.unit.test.ts` — 6 passed
- `pnpm exec vitest run -c vitest.unit.config.ts packages/tiktok-publishing/src/tiktok-account-oauth.unit.test.ts` — 4 passed
- `pnpm exec vitest run -c vitest.unit.config.ts packages/config/src/tiktok-secret-store-config.unit.test.ts` — 2 passed
- `pnpm exec vitest run -c vitest.unit.config.ts packages/observability/src/log-redaction.unit.test.ts` — 3 passed

## Risks

- Local encrypted store requires operator-supplied `MEDIAFORGE_TIKTOK_SECRET_ENCRYPTION_KEY`; SQLite persistence of handles remains a later task.

## Backlog

- MICRO-023 → DONE
- MICRO-024 → READY
