# Provider-neutral speech generation run

Date: 2026-08-01

Changed files: `packages/speech/src/platform/*`, speech mastering/exports,
`packages/persistence/src/postgres-speech-repository*`, config, API speech contracts and
routes, connected CLI commands, web administration model, example profiles, architecture,
ADRs, setup/runbook/security/migration docs, and focused tests.

Checks: targeted Prettier completed; `pnpm lint:affected` passed (exit 0); focused Vitest
passed 9 files/43 tests (exit 0). A prior focused mastering rerun passed 4 tests. The API
integration file requested in the final unit-config command was excluded by that config.
An affected-package typecheck was started earlier, but its wrapper did not return a final
exit status, so it is not claimed as verified.

Risks: production API composition is absent; legacy direct OpenAI paths remain; PostgreSQL
concurrency/quota races, real FFmpeg output, workflow resume, migrations, and full
frontend/API integration are unverified. No paid provider call was made.

Follow-up: compose durable use cases, migrate all legacy callers, then run the omitted
integration, migration, audio, concurrency, and regression suites.

Commit: not committed; base `a30e981`.
