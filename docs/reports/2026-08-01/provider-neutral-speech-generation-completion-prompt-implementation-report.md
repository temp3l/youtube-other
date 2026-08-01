# Provider-neutral speech completion implementation report

Source plan: `docs/plans/provider-neutral-speech-generation-completion-prompt.md`

Date: 2026-08-01

## Summary

Production API composition uses PostgreSQL-backed profiles, resolution, cache/fencing, generations, retries, quota/usage/audit, artifacts, and telemetry. Legacy callers use a service-backed compatibility facade.

## Files changed

`apps/api`, `apps/cli`, `packages/speech`, `packages/persistence`, `packages/dark-truth`, and speech audit/architecture/operations docs.

## Tasks completed

Durable use cases; API/CLI operations; profile approval/deprecation; chunk retry reuse; ElevenLabs hardening; real FFmpeg validation; OpenAI regression; migration/concurrency tests; direct-call audit.

## Tasks partially completed

Workflow/frontend integration remains behind the compatibility/view boundaries. Consent CRUD and exporter bindings remain absent.

## Tasks not completed

Canonical narration lookup by video ID and direct episode-journal/API orchestration.

## Deviations

No framework was added to the server-rendered frontend. The final PostgreSQL rerun was blocked by sandbox approval timeout; an earlier focused run passed.

## Tests/checks run and results

Affected lint and API/speech/persistence/Dark Truth typechecks passed. Focused unit suites passed 50 tests; non-database integrations passed 21. PostgreSQL suites previously passed 6 tests. Two unrelated fixture/schema suites failed.

## Known risks or follow-up work

Remove the facade after 2026-10-01; persist canonical narration; wire journals/frontend; expose consent operations; rerun PostgreSQL tests.

## Recommended next steps

Complete those four gaps before declaring all acceptance gates complete.

Commit: `b3d8863`.
