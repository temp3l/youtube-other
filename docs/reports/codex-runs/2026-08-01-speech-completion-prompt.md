# Provider-neutral speech completion run

Date: 2026-08-01

Summary: composed production PostgreSQL speech use cases; added durable profile, cache, retry, quota, usage, audit, and artifact behavior; routed legacy operational callers through `SpeechGenerationService`; hardened providers/audio; reconciled docs.

Changed paths: `apps/api`, `apps/cli`, `packages/speech`, `packages/persistence`, `packages/dark-truth`, `docs/{architecture,development,migrations,runbooks,reports}`.

Tests/checks: affected lint; API/speech/persistence/Dark Truth typechecks; 50 focused unit tests; 21 non-database integrations; earlier 6 PostgreSQL integrations. All scoped checks passed. Unrelated Dark Truth fixture discovery and math benchmark-schema suites failed. Final PostgreSQL rerun was blocked by sandbox approval timeout.

Commit: `b3d8863` (implementation).

Unresolved risks: canonical narration lookup, direct episode-journal/frontend API integration, consent CRUD, exporter bindings, and compatibility-facade removal remain.
