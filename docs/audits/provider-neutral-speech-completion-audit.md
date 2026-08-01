# Provider-neutral speech completion audit

Date: 2026-08-01

## Outcome

INCOMPLETE. Production API/CLI and legacy operational callers converge on
`SpeechGenerationService`, but canonical narration lookup, direct episode-journal
orchestration, frontend API actions/i18n, and consent operator endpoints remain.

## Verification

- `pnpm lint:affected` — exit 0.
- Persistence and speech builds; API, CLI, and Dark Truth typechecks — exit 0. The earlier
  aggregate CLI typecheck exposed unrelated approval/math fixture errors; the final
  focused CLI typecheck passed.
- Focused unit batches — 50 tests passed. Unrelated Dark Truth source-fixture discovery
  and math benchmark-schema import suites failed.
- Non-database integration batch — 21 tests passed, including real FFmpeg mastering,
  legacy OpenAI regression, educational resume, and API HTTP contracts.
- PostgreSQL integration suites — 6 tests passed before the final retry/deprecation edit;
  the final rerun was blocked twice by sandbox approval timeout.
- `git diff --check` and direct provider-call search — clean; SDK calls remain only in
  `packages/speech` transport/adapter boundaries.

## Acceptance gates

| Gate | Status | Evidence |
| --- | --- | --- |
| All entry points use one service | PARTIAL | API/CLI/legacy facade pass; journal/frontend actions absent |
| No independent provider invocation | PASS | direct-call audit; `legacy-application-adapter.ts` |
| OpenAI regression | PASS | `legacy-application-adapter.integration.test.ts` |
| ElevenLabs mocked hardening | PASS | `elevenlabs-provider.unit.test.ts` (12) |
| Disabled startup/missing credential safety | PASS | config validation and API composition |
| Durable resolution/defaults | PASS | PostgreSQL/API integration tests |
| Immutable pinned versions | PASS | PostgreSQL integration tests |
| Consent enforcement | PASS | profile administration/service boundaries |
| Cache/force/recovery/fencing | PASS | PostgreSQL integration tests |
| Race-safe quota reconciliation | PASS | PostgreSQL integration tests |
| No provider/voice fallback | PASS | service and OpenAI regression tests |
| Raw and canonical audio validation | PASS | FFmpeg integration tests |
| Durable state/retry/cancel/usage/audit | PASS | application repository and API tests |
| Secret/narration redaction | PASS | contracts, telemetry allowlist, HTTP tests |
| Bounded metrics | PASS | `observability.ts`; service metrics |
| Migration/backfill/rollback/tenant isolation | PASS | PostgreSQL integration tests |
| Documentation reconciled | PASS | speech architecture/operations docs |
| Pilot clone stays draft/approved | PASS | setup/checklist; no activation seed |

## Rollout inputs

Run the PostgreSQL migration through API startup. Configure
`MEDIAFORGE_WORKFLOW_DATABASE_URL`, workspace directory, OpenAI credentials for OpenAI
dispatch, and the documented ElevenLabs variables. Keep ElevenLabs disabled initially,
create/approve profiles explicitly, then set one policy with `If-Match`. Logical rollback
sets workspace speech dispatch disabled and preserves artifacts/audits.
