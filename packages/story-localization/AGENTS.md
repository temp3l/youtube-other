# AGENTS

Story-localization guardrails:

- Use the root execution budget and non-convergence rules from `../../AGENTS.md`.
- Run the smallest relevant Vitest file first with `pnpm test:focused -- packages/story-localization/src/<file>.test.ts`.
- When debugging one failure, add an exact test-name filter and keep fail-fast behavior enabled.
- Do not use a general workspace test wrapper until the focused file passes and the task explicitly requires broader coverage.
- Do not regenerate story, localization, short, batch, manifest, or cache fixtures automatically.
- Mock or fake provider calls. Do not issue paid provider requests.
- Assert lineage, schema-selection, validation, cache, and provider-call fields individually instead of broad snapshots.
- Broad full-story or short-story regression coverage belongs to Task 17 unless the current task explicitly requires one narrow regression group.
- Do not alter full/short compatibility behavior merely to satisfy old fixtures.
