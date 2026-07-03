# Task 20 final cleanup and validation report

Generated: 2026-07-03

## Implementation checklist status

- Read required plan files and repository-local instructions.
- Checked branch/worktree before edits.
- Ran mandatory stale-reference search.
- Classified remaining matches.
- Fixed one in-scope canonical Short parser defect.
- Fixed episode CLI option forwarding when root and subcommand both define `--language`.
- Normalized episode 022 canonical full and Short scripts to the required source-heading contract.
- Ran focused tests, CLI typecheck/build, migration dry-run, and episode 022 dry-run/validation checks.
- Did not run paid providers.

## Files changed by this task

- `packages/dark-truth/src/index.ts`
- `packages/dark-truth/src/index.unit.test.ts`
- `apps/cli/src/episode-commands.ts`
- `apps/cli/src/episode-commands.unit.test.ts`
- `episodes/022-the-whistler-in-the-woods/languages/script-en.md` (ignored production data)
- `episodes/022-the-whistler-in-the-woods/languages/script-de.md` (ignored production data)
- `episodes/022-the-whistler-in-the-woods/languages/short/script-en.md` (ignored production data)
- `episodes/022-the-whistler-in-the-woods/languages/short/script-de.md` (ignored production data)
- `docs/plans/remove-legacy-and-normalize-paths/reports/task-20-final-cleanup-and-validation.md`
- `docs/plans/remove-legacy-and-normalize-paths/tasks/20-final-repository-cleanup-and-validation.md`

## Stale-reference search

Mandatory command:

```bash
rg "script.md|en/full/script.md|de/full/script.md|@mediaforge/pipeline|createPipeline|legacy" .
```

Result: completed with matches. Output was too large for terminal capture because historical docs, generated SVGs, and prior task reports dominate the result.

Refined source classification commands:

```bash
rg -l "script.md|en/full/script.md|de/full/script.md|@mediaforge/pipeline|createPipeline|legacy" .
rg -n "script.md|en/full/script.md|de/full/script.md|@mediaforge/pipeline|createPipeline|legacy" apps packages --glob '!**/*.svg'
rg -n "@mediaforge/pipeline|createPipeline|story-workflow-legacy|legacyGeneratedImage|legacyMixed|audio/script-source|original-transcript.json|narrationPipelineMode|path\\.join\\([^\\n]*episodeDir[^\\n]*script\\.md" apps packages docs --glob '!docs/plans/remove-legacy-and-normalize-paths/**' --glob '!docs/diagrams/rendered/**'
```

## Remaining match classification

### Active and intentional

- `packages/shared/src/episode-filesystem.ts`: stale path candidates are resolver rejection inputs; generated locale script path is active artifact output; legacy image path helpers are compatibility path reporting.
- `packages/shared/src/episode-filesystem.unit.test.ts`: resolver rejection, cache identity, and compatibility assertions.
- `packages/config/src/index.ts`, `apps/cli/src/index.ts`, `apps/cli/src/index.unit.test.ts`, `packages/speech/src/narration-schemas.ts`, `packages/speech/src/narration-pipeline.ts`: `narrationPipelineMode` rollout remains active with `legacy|shadow|new`.
- `packages/speech/src/dark-truth-adapter.ts`, `packages/speech/src/narration-paths.ts`: active narration compatibility output.
- `packages/image-generation/src/episode-image-pipeline.ts`, `packages/image-generation/src/shorts-image-strategy.ts`, related tests: active compatibility reads for previous image/character state.
- `packages/visual-planning/src/legacy-shot-plan.ts`, `packages/visual-planning/src/index.ts`, related tests: active migration tool detection.
- `apps/cli/src/episode-layout-migration-command.ts` and test: migration-tool detection.
- `apps/cli/src/thumbnail-commands.ts`: `--episode` legacy alias is an intentional CLI compatibility alias.
- `packages/story-localization/src/story-prompt-response-schemas.ts`, `story-artifact-model.ts`, related tests: active import normalization for legacy response payloads.
- `packages/story-localization/src/story-localization.service.ts`, `story-localization-batch-service.ts`, `story-localization-cache.ts`, `canonical-full-story.persistence.ts`, `short-rewrite.utils.ts`: generated story-localization compatibility outputs, not authored episode input.
- `apps/cli/src/story-full-rewrite-command.ts`, `apps/cli/src/story-localization-commands.ts`: dry-run/planning output still describes generated compatibility files.

### Migration-tool detection

- `apps/cli/src/episode-layout-migration-command.ts`
- `apps/cli/src/episode-layout-migration-command.unit.test.ts`
- `packages/visual-planning/src/legacy-shot-plan.ts`
- `packages/visual-planning/src/legacy-shot-plan.unit.test.ts`

### Historical documentation intentionally retained

- `docs/plans/remove-legacy-and-normalize-paths/**`
- `docs/plans/natural-openai-narration/**`
- `docs/plans/story-pipeline-*.md`
- `docs/plans/07-canonical-english-full-generation-plan.md`
- `docs/audits/**`
- `todo-prompts/**`
- `docs/decisions/README.md`
- `docs/architecture/target-media-architecture.md`
- `docs/architecture/story-prompt-compiler.md`
- `docs/migrations/media-consolidation-plan.md`
- `docs.bak/**` ignored by repository policy.

### False positives

- `docs/diagrams/rendered/*.svg`: generated diagram text; no source contract.
- `docs/diagrams/*.mmd`: diagram labels only.
- `README.md`: root README is ignored for architecture guidance by repository policy.
- `content-ideas/**`, `channels/**`: content/archive references, not implementation contracts.

### Final cleanup result

Episode 022 no longer has stale root, `en/script.md`, `en/full/script.md`, or `de/full/script.md` duplicates in the working tree. The canonical full and Short English/German scripts now include the required audio, narration, and metadata headings.

The migration dry-run still reports historical duplicate/divergent source data in other episodes and `source/` archive files. Those are classified as broader repository data cleanup, not blockers for the task 20 gate on episode 022.

## Cleanup performed

`parseEpisodeSourceFile` now derives the episode slug correctly for canonical `languages/short/script-<language>.md` paths. A regression test copies an existing source-pack Short file into the canonical layout and verifies episode id, episode number, language, and artifact type.

Episode CLI commands now merge root options with subcommand options. This prevents `mediaforge episode dry-run --language de` from being interpreted as the root `--language` while the episode command silently defaults to English.

## Validation

Passed:

```bash
pnpm test:focused -- packages/shared/src/episode-filesystem.unit.test.ts
pnpm test:focused -- apps/cli/src/index.unit.test.ts
pnpm test:focused -- apps/cli/src/episode-commands.unit.test.ts
pnpm --filter @mediaforge/cli typecheck
pnpm --filter @mediaforge/cli build
pnpm --filter @mediaforge/api typecheck
pnpm test:focused -- packages/dark-truth/src/index.unit.test.ts
pnpm --filter @mediaforge/dark-truth typecheck
pnpm --filter @mediaforge/dark-truth build
```

Migration dry-run:

```bash
node apps/cli/bin/mediaforge.js episode migrate-layout --episodes-root episodes --dry-run
```

Exit code: 0. Summary: `already_canonical: 43`, `safe_move: 0`, `identical_duplicate: 3`, `divergent_duplicate: 18`, `target_collision: 0`, `stale_unsupported_layout: 0`, `invalid_language_or_variant: 7`, `filesystem_error: 2`.

Episode 022 checks:

```bash
node apps/cli/bin/mediaforge.js episode dry-run --episode 022 --source episodes --output-root episodes --language en --artifact full
node apps/cli/bin/mediaforge.js episode dry-run --episode 022 --source episodes --output-root episodes --language de --artifact full
node apps/cli/bin/mediaforge.js episode validate --episode 022 --source episodes --output-root episodes --language en --artifact full
node apps/cli/bin/mediaforge.js episode validate --episode 022 --source episodes --output-root episodes --language de --artifact full
node apps/cli/bin/mediaforge.js episode dry-run --episode 022 --source episodes --output-root episodes --language en --artifact short
node apps/cli/bin/mediaforge.js episode dry-run --episode 022 --source episodes --output-root episodes --language de --artifact short
node apps/cli/bin/mediaforge.js episode validate --episode 022 --source episodes --output-root episodes --language en --artifact short
node apps/cli/bin/mediaforge.js episode validate --episode 022 --source episodes --output-root episodes --language de --artifact short
```

Full English/German status: passed.

Short English/German status: passed.

## Paid provider confirmation

No OpenAI, image, speech, transcription, rendering provider, upload, or other paid provider calls were executed. Commands were stale searches, local tests/typechecks/build, migration dry-run, and CLI dry-run/validation-only commands.

## Workspace artifact review

Pre-existing untracked/ignored artifacts remain:

- Untracked content zip files and `content-ideas/content/youtube-horror-rewrites/other/`.
- Ignored `.env`, SQLite files, caches, `dist/`, `node_modules/`, `episodes/`, `secrets/`, `preview/`, and package `tsconfig.tsbuildinfo`.

This task added no credentials and no production data deletion.

## Release notes

- Canonical authored episode scripts are resolved from `episodes/<slug>/languages/script-<language>.md` and `episodes/<slug>/languages/short/script-<language>.md`.
- Stale authored script layouts now block full setup instead of being selected implicitly.
- Short setup now recognizes canonical `languages/short` paths for episode identity.
- `mediaforge episode ... --language <code>` now honors the requested language even with the root-level `--language` option present.

## Rollback steps

1. Revert `packages/dark-truth/src/index.ts`, `packages/dark-truth/src/index.unit.test.ts`, `apps/cli/src/episode-commands.ts`, and `apps/cli/src/episode-commands.unit.test.ts`.
2. Restore episode 022 ignored script edits from backup if the source-contract normalization must be undone.
3. Rebuild `@mediaforge/cli` and `@mediaforge/dark-truth` if built artifacts are used locally.
4. For narration rollout issues, set `MEDIAFORGE_NARRATION_PIPELINE_MODE=legacy`.

## Merge readiness verdict

READY. Focused code validation passes, episode 022 English/German full and Short dry-run/validation checks pass, and no paid providers were called.
