# Repository Analysis And Baseline Plan

## Summary

Create a baseline report at `todo-prompts/story-rewrite-refactor-codex-prompts/repository-analysis-and-baseline.md`. This task will be documentation-only unless inspection reveals a task-spec-required, non-invasive measurement helper is unavoidable. No production refactor, prompt rewrite, command change, API call, or artifact migration will be done.

## Current Repository Findings To Document

- Packages/files involved:
  `apps/cli`, `packages/story-localization`, `packages/config`, `packages/shared`, `packages/metadata`, `packages/scene-planning`, `packages/image-generation`, `packages/youtube-upload`, plus downstream `packages/speech`, `packages/rendering`, `packages/dark-truth`, `packages/pipeline` where CLI commands route media stages.
- Story-producing commands:
  `stories localize`, `stories rewrite-full`, `stories rewrite-short`, `stories:batches *`, and legacy `episode english`, `episode localized`, `episode short`.
- Locale support:
  current code supports `en`, `de`, `es`, `fr`, `pt`; Portuguese is `pt-BR` in story rewrite/localization paths. `fr/full` and `fr/short` remain supported by story localization and short rewrite code, though some downstream YouTube channel config only has German/Spanish/French special cases and no Portuguese-specific channel fields.
- Full-story call graph:
  `apps/cli/src/index.ts` -> `registerStoryLocalizationCommands` -> `registerStoryRewriteFullCommand` -> `resolveFullRewriteInput` -> `materializeCanonicalSourceStory` -> `createStoryLocalizationConfig` -> `createOpenAiStoryClientWithOptions` -> `localizeStoryEpisode` -> `buildLocalizationPrompt` -> `loadAudioTemplate(system-prompt.md/full-story-prompt.md)` -> `generateStructuredStoryPackage` -> `callOpenAiStructured` -> OpenAI `responses.parse/create`.
  Legacy/batch path: `stories localize` -> `commandStoriesLocalize` -> `prepareStoryLocalizationBatch`/`submitStoryLocalizationBatch` or `localizeSelectedStories` -> `localizeStoryEpisode`.
- Short-story call graph:
  `apps/cli/src/index.ts` -> `registerStoryLocalizationCommands` -> `registerStoryRewriteShortCommand` -> `rewriteShortStories` -> `resolveShortRewriteInput` -> `materializeCanonicalSourceStory` -> `generateLanguagePayload` -> `buildShortRewritePrompt` -> `loadAudioTemplate(system-prompt.md/short-story-prompt.md)` -> `requestStructuredShortRewrite` -> OpenAI `responses.parse/create`.
  Legacy short path: `localizeStoryEpisode` can generate English short via `rewriteShortStories` and localized shorts from generated full package output or fallback transformations.
- Current lineage defect to make explicit:
  `rewrite-short` requires a validated generated full story unless `--compatibility-source` is passed, but `stories localize` and some legacy flows can still derive shorts from raw/canonical source or combined full+short localization responses. The report will separate these lineages.
- Known runtime defect:
  prompt builders load `docs/templates/audio/system-prompt.md`, `full-story-prompt.md`, and `short-story-prompt.md`, but those files are absent from the repo outside generated debug artifacts/references, so runtime prompt loading can fail.

## Report Contents

- Add the required baseline table with columns:
  `Stage | Current command/function | Source artifact | Output artifact | Model/config | Validation | Cache/resume | Known defect`.
- Include sections for:
  full-story graph, short-story graph, model/config routing and `.env` precedence, prompt builders and duplicated prompt sections, validation/repair/retry behavior, cache/resume/persistence, cost/telemetry, and downstream media commands.
- Downstream command inventory will cover:
  `audio generate`, `audio generate-localized`, `clips generate`, `images plan/generate/generate-openai/resume/sync-shared`, `render`, `metadata generate`, `metadata youtube`, `youtube upload`, plus legacy episode commands where relevant.
- Minimal instrumentation:
  none planned. Baseline measurement will use static code inspection, package scripts, existing debug artifacts, manifests, and deterministic token/cost code paths only. No paid API calls.

## Verification Commands

- `pnpm --filter @mediaforge/story-localization typecheck`
- `pnpm --filter @mediaforge/cli typecheck`
- `pnpm test:unit -- packages/story-localization/src/story-localization.unit.test.ts packages/story-localization/src/short-rewrite.unit.test.ts packages/story-localization/src/full-rewrite.resolution.unit.test.ts`
- Documentation/path checks with `rg`/`test -f` for the new report and referenced prompt-template paths.

## Risks And Uncertainties

- Some CLI output depends on built `dist`; the analysis will inspect TypeScript source as authoritative and avoid changing build outputs.
- Existing generated episode debug files may show past prompt material, but they are artifacts, not source templates.
- Downstream media behavior spans several packages and legacy paths; the report will name only verified source files/functions and explicitly mark uncertain or broken assumptions.
