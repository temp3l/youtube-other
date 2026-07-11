Changed files:
- packages/story-localization/src/story-localization.service.ts
- packages/story-localization/src/story-localization.unit.test.ts
- docs/reports/codex-runs/2026-07-10-story-localization-preflight-temperature-fix.md

Tests/checks run:
- `pnpm exec vitest run -c vitest.unit.config.ts packages/story-localization/src/story-localization.unit.test.ts`
- `pnpm exec vitest run -c vitest.unit.config.ts packages/story-localization/src/story-localization.unit.test.ts -t "omits temperature from the OpenAI preflight request for GPT-5 models"`
- `pnpm --filter @mediaforge/story-localization build`
- `node apps/cli/bin/mediaforge.js stories localize --episode 034 --source-dir content-ideas/content/dark-truth-episodes-english-only --output-dir content-ideas/content/dark-truth-episodes-optimized --languages de,es,fr,pt --include-english-short --mode sync --force --json --verbose`

Results:
- Fixed sync-mode OpenAI connectivity preflight to omit `temperature` for GPT-5-family models.
- Added a regression test covering `gpt-5.6-luna`.
- Narrow test passed.
- Rebuilt `@mediaforge/story-localization` and reran episode `034`.
- The previous `Unsupported parameter: 'temperature'` error no longer occurs.
- Current provider response is `403 model_not_found`: project lacks access to `gpt-5.6-luna`.

Risks remaining:
- The broader `story-localization.unit.test.ts` file still has unrelated pre-existing failures in source/fact/validation scenarios.
- Episode `034` remains blocked on model entitlement rather than request-shape compatibility.

Follow-up tasks:
- Switch localization to a model the project can actually access, then rerun episode `034`.
