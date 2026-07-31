# Testing Strategy

## Test pyramid and gates

1. Characterization tests freeze current CLI behavior, artifact identities, approval gates, retry classification, resume, and YouTube mutation order before extraction.
2. Contract tests run each application port against local and target adapters (filesystem/object storage, JSON/relational workflow repositories).
3. Use-case tests invoke the same typed handler through CLI and HTTP adapters and compare normalized outcomes.
4. OpenAPI request/response and generated-client tests prevent schema drift.
5. Integration tests use disposable SQL, object storage emulator, queue, fake OIDC/JWKS, provider fakes, and controlled process runners.
6. End-to-end tests cover one Dark Truth and one mathematics workflow with provider-free fixtures.
7. Fault-injection tests crash at every checkpoint around storage registration, queue claim, provider acceptance, approval, and publication.
8. Security tests cover BOLA, path/symlink escape, SSRF, malicious media, webhook replay, secret redaction, and resource exhaustion.

## Repository evidence to reuse

- **Verified:** workflow store/operator/cache/batch unit tests exist under `packages/workflow-engine/src/*.unit.test.ts`.
- **Verified:** publication approval, mutation seam, and generic publisher tests exist under `packages/youtube-upload/src`.
- **Verified:** math workflow resume and production gate tests exist under `packages/math-education/src/orchestration`.
- **Verified:** path containment tests exist in `packages/shared/src/episode-filesystem.unit.test.ts` and worker/storage packages.
- **Recommended:** promote these into adapter conformance suites rather than duplicating fixtures at the API layer.

## Critical scenario matrix

| Scenario                        | Expected guarantee                                                |
| ------------------------------- | ----------------------------------------------------------------- |
| concurrent equal command        | one idempotency record/run; exact replay                          |
| same key, changed body          | `409 IDEMPOTENCY_KEY_CONFLICT`                                    |
| worker dies during step         | lease expires; attempt interrupted; safe resume                   |
| crash after upload accepted     | no blind re-upload; reconcile marker/video ID or require operator |
| CLI and API mutate same episode | optimistic version conflict or serialized lease                   |
| approval revoked while queued   | worker recheck blocks publication                                 |
| batch partial failure           | successful items retained; retryable items resume independently   |
| cancellation during FFmpeg      | signal propagated, process killed, partial asset quarantined      |
| object registration failure     | unregistered blob cleaned; no success state                       |
| webhook repeated/out of order   | consumer can dedupe/order by event and subject version            |

## Migration parity gate

For each migrated command: capture input, normalized plan, task fingerprints, resulting workflow state, artifact manifests/hashes (allowing documented nondeterminism), errors, exit code, and side-effect calls. Switch the CLI only after the use case passes parity. Retain a feature-flagged rollback adapter for one release; do not maintain two writable implementations.

Pilot requires focused package tests plus API integration and both provider-free E2E profiles. GA adds load/soak, queue recovery, backup/restore, credential rotation, migration rollback, webhook chaos, and publication fault injection.
