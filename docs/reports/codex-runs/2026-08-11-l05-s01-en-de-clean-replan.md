# L05-S01 EN/DE clean re-plan

Summary: rebuilt a clean EN pre-image workspace from the current planner and authoritative EN story; copied the authoritative DE production script only. EN deterministic readiness failed and source-grounded QA exhausted its four-call ceiling before beat/sequence adjudication. DE selected audio is stale: its prior script omits the authoritative planning/takeaway section.

Changed paths: `packages/shared/src/semantic-image-prompt.ts` (removed an obsolete policy argument needed to build the CLI); ignored generated artifacts under `episodes/l05-s01-you-dont-need-a-publisher/`.

Checks: `pnpm --filter @mediaforge/shared build`, `pnpm --filter @mediaforge/speech build`, and `pnpm --filter @mediaforge/cli build` passed. Focused Vitest failed in the pre-existing semantic-image-prompt capability-policy expectation; `git diff --check` passed.

Commit: `f587d4075b2ff5d40fa1f056492cb4bf7f8cf246`.

Unresolved risks: fix deterministic provider-readiness failures, then re-run complete beat and sequence QA within a new authorized budget; produce compatible DE audio before DE timing. No TTS, images, rendering, or publication occurred.
