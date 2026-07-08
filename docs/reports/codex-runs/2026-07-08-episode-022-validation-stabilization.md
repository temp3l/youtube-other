# Episode 022 Validation Stabilization

Original request: focused no-paid stabilization for `022-the-whistler-in-the-woods`.

Context used: AI pack flagged dirty tree, stale `022` validation/visual-retention artifacts, dry-run-only story pipeline, and possibly stale `dist`.

Inspected: `AGENTS.md`, required AI context files/reports, CLI episode/shots/story pipeline code, shared resolver, visual-planning validation, `022` manifests, scripts, visual-retention state, image/narration artifacts.

Inventory summary: `episodes/` artifacts are ignored, not tracked. Canonical scripts exist for `en/de` full and short. `en/full` generation manifest was stale: missing source identity and visual-retention refs. Shot plan lacked current source identity. Legacy image manifest used older timing filenames but valid existing assets.

Changed files: `apps/cli/src/episode-cross-manifest-validator.ts`, `apps/cli/src/episode-cross-manifest-validator.unit.test.ts`, ignored `episodes/022.../en/full/generation-manifest.json`, `current-artifact.json`, `state/visual-retention/shot-plan.full.en.json`, `validation.full.en.json`, and rebuilt ignored `apps/cli/dist`.

Fixes: accepted legacy Dark Truth image manifests without canonical filename enforcement; resolved narration assembly audio relative to narration root; refreshed local shot artifacts and manifest hashes.

Commit hash: not created.

Commands/results: `pnpm mediaforge -- episode dry-run --episode 022-the-whistler-in-the-woods --language en --artifact full --json` pass; `pnpm mediaforge -- episode validate --episode 022-the-whistler-in-the-woods --language en --artifact full --json` failed first, passed final; `pnpm mediaforge -- stories pipeline --episode 022-the-whistler-in-the-woods --dry-run --json` pass; `pnpm mediaforge -- shots validate --episode 022-the-whistler-in-the-woods --locale en --variant full --format json` failed first, passed final; `pnpm mediaforge -- shots plan --episode 022-the-whistler-in-the-woods --locale en --variant full --format json` pass; `pnpm test:focused -- apps/cli/src/episode-cross-manifest-validator.unit.test.ts` pass; `pnpm --filter @mediaforge/cli typecheck` pass; `pnpm --filter @mediaforge/cli build` pass.

Remaining risks/follow-up: shot validation passes with 149 warnings; broader locales/variants not reconciled; story pipeline remains skeleton-only; no provider/API/upload/remote-render calls made. Unrelated content archives and other episodes intentionally untouched.
