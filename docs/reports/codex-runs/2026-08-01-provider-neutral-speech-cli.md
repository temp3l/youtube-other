# Provider-neutral speech CLI

Changed files: `apps/cli/src/speech-commands.ts`, `apps/cli/src/speech-commands.unit.test.ts`, and `apps/cli/src/index.ts`.

The CLI now exposes provider-neutral profile, estimate, generation, status, and retry commands. It uses only the authenticated connected API boundary, emits machine-readable JSON, and maps API failures to non-zero typed exit codes. Estimate output includes the resolved profile, cache expectation, and quota impact.

Checks run: `pnpm exec vitest run -c vitest.unit.config.ts --bail=1 apps/cli/src/speech-commands.unit.test.ts` (pass); `pnpm --filter @mediaforge/cli typecheck` (pass).

Risks/follow-up: the API deployment must include the new speech endpoints, including profile-version validation; no direct provider credentials or SDKs are used by the CLI.
