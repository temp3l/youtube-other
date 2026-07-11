Summary: Fixed episode rewrite false positives, localized character matching, optional canonical-fact persistence, and English-before-localized short orchestration. Localized short fan-out now includes English explicitly, waits for its persisted result, and reports the English prerequisite failure instead of misleading child failures.

Changed files:
- `packages/story-localization/src/generated-story-validator.ts`
- `packages/story-localization/src/localization-fidelity.ts`
- `packages/story-localization/src/story-facts.persistence.ts`
- `packages/story-localization/src/story-localization.service.ts`
- `packages/story-localization/src/short-rewrite.service.ts`
- Matching focused unit tests for all four areas
- `docs/reports/codex-runs/2026-07-11-rewrite-pipeline-fixes.md`

Tests/checks:
- Four-file focused Vitest command — 47 passed; one new orchestration test initially exposed a stale canonical fixture, then a prerequisite-gating expectation
- Exact short prerequisite test — passed
- `pnpm --filter @mediaforge/story-localization typecheck` — passed
- `git diff --check` — passed before final report creation

Risks remaining: No paid OpenAI regeneration was run. The full short-service file passed except the new test during the intermediate combined run; after the final gating repair, the exact regression passed within the verification budget. Existing unrelated dirty-tree changes were preserved.

Commit: `96bc991b4f481e79eabaf0d4c4949f9ef50da7db`
