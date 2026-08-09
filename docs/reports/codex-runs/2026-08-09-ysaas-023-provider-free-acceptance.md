# YSAAS-023 provider-free acceptance

Summary: Extended the API-context provider-free BFF fixture with stale-brief protection. One current revision succeeds; a second BFF edit with the same stale revision gets a safe `412`, and the durable record retains only the current brief.

Changed paths: `apps/api/src/provider-free-bff.integration.test.ts`, plan ledger, and reports.

Checks: `git diff --check` passed. `pnpm test:focused -- apps/api/src/provider-free-bff.integration.test.ts` collected one test but skipped it because this checkout has no `.env`/`.env.postgres` disposable-Postgres configuration. Prior evidence: provider-free executor unit test passed (5); durable workflow integration passed (8); initial BFF fixture passed (1).

Commit: `cdccac7`.

Risks: No accepted evidence yet for quota, stale review, webhook replay, validation/quarantine, cancellation/reclaim, revoked membership, or a completed review/audit journey. Rerun the focused fixture with its disposable-Postgres URLs before accepting this slice. The fixture deliberately omits onboarding because its lifecycle read model is outside the workflow-schema setup. Do not certify YSAAS-023 yet.
