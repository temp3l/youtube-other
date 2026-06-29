# Story IR And Artifact Variant Modeling Plan

## Summary

Add an isolated StoryIR and artifact variant model to `@mediaforge/story-localization`, with runtime Zod schemas, legacy adapters, focused unit tests, and a repository-grounded baseline document. No CLI command, artifact layout, `.env` precedence, resume behavior, prompt text, or OpenAI-calling path will be changed.

## Current Repository Grounding

- Packages involved:
  `packages/story-localization`, `apps/cli`, `packages/config`, `packages/shared`, and documentation under `docs/architecture` plus `docs/plans`.
- Full-story call graph:
  `apps/cli/src/index.ts` -> `registerStoryLocalizationCommands` / `registerStoryRewriteFullCommand` -> `createStoryLocalizationConfig` -> `localizeStoryEpisode` -> `parseCanonicalSourceStory` -> `extractCanonicalStoryFacts` -> `analyzeStorySource` / `buildStoryBible` / `buildOriginalityReview` / `buildRetentionPlan` -> `buildFullPromptConfig` -> `buildLocalizationPrompt` -> `loadAudioTemplate(system-prompt.md/full-story-prompt.md)` -> `generateStructuredStoryPackage` -> `callOpenAiStructured` -> OpenAI Responses API -> validation/repair -> renderer/cache/artifact writes.
- Short-story call graph:
  `registerStoryRewriteShortCommand` -> `rewriteShortStories` -> `resolveShortRewriteInput` -> `materializeCanonicalSourceStory` -> `generateLanguagePayload` -> `buildShortRewritePrompt` -> `loadAudioTemplate(system-prompt.md/short-story-prompt.md)` -> `requestStructuredShortRewrite` -> OpenAI Responses API -> validation/repair -> sidecar/manifest/compatibility writes.
- Existing variant identity:
  `packages/shared/src/episode-filesystem.ts` already has `ContentVariant = "full" | "short"` and `EpisodeContext { episodeId, locale, variant }`, but story-localization has separate full/short artifact shapes and no unified artifact owner/variant contract.
- Model/config routing:
  full rewrite uses CLI option -> `runtimeConfig.openAiStory*` -> defaults; short rewrite uses CLI option -> `openAiShort*` -> `openAiStory*` -> defaults. `.env` is loaded from cwd and overridden by `process.env`; runtime overrides take precedence in `packages/config/src/index.ts`.
- Prompt builders and duplicated prompt sections:
  both full and short prompt paths load `system-prompt.md`, inject locale settings, target duration/WPM/word ranges, source delimiters, and preservation constraints. Current source templates are expected at `docs/templates/audio/*`, but only `docs.bak/templates/audio/*` exists; this remains a documented risk, not a source of truth.
- Validation/repair/retry/cost/resume:
  full path validates generated full/package payloads, written messages, hashtags, filler/editorial drift, cache entries, and source hash markers; retries OpenAI transport failures up to 5 attempts and can issue repair calls. Short path validates strict JSON, word ranges, hook match, thumbnail words, production labels, editorial commentary; retries transient OpenAI errors per `maxRetries` and issues one repair. Cost is token-estimated from usage where pricing is configured. Resume is cache/hash/output based for full and sidecar/hash/model/prompt-version based for short.

## Implementation Changes

- Add a new isolated model module in `packages/story-localization/src/story-artifact-model.ts` and export it from `packages/story-localization/src/index.ts`.
- Define:
  `StoryArtifactVariant = "full" | "short"`;
  artifact owner enum: `narration | metadata | audio | scene-plan | image-plan | render | publication`;
  artifact identity schema with `episodeNumber`, `episodeSlug`, `language`, `locale`, `variant`;
  `FullStoryOutputConstraints`, `ShortStoryOutputConstraints`, and discriminated `StoryOutputConstraints`.
- Define `StoryIR` as source truth only:
  genre, fictionality, entities, immutable facts, chronology, central threat, central rule/mechanism, critical objects, written messages, climax, ending consequence, and allowed invention boundaries.
- Add issue schemas/types for:
  `LOCATION_CLASSIFIED_AS_CHARACTER`, `EVENT_CLASSIFIED_AS_CHARACTER`, `SUPERNATURAL_RULE_IN_NONFICTION`, `INVALID_WORD_RANGE`, `FULL_STORY_ROUTED_TO_SHORT_GENERATOR`, `SHORT_STORY_ROUTED_TO_FULL_REGENERATION`.
- Add adapters in the same module from:
  `CanonicalStoryFacts`, parsed/current story production artifacts, generated full packages, and short rewrite sidecars/artifacts. These adapters will normalize legacy shapes without changing persisted artifact compatibility.
- Add validation helpers that return typed issues instead of throwing for StoryIR/routing checks; keep current generation validators untouched.
- Minimal instrumentation:
  none beyond deterministic validation helpers and tests. No paid API calls, no prompt recompilation, no CLI behavior changes, no generated artifact migration.

## Documentation

- Create `docs/plans/story-ir-and-artifact-variant-modeling.md` with:
  exact files/packages, current full call graph, current short call graph, model/config routing, prompt duplication, validation/repair/retry/cost/persistence/resume behavior, proposed normalized model, and risks.
- Update `docs/architecture/story-localization.md` only to add a short reference to the new normalized model and the plan document. No broad architecture rewrite.
- Do not modify task-pack files except if implementation notes need to be recorded in the authoritative task area after approval.

## Tests And Verification

- Add focused unit tests in `packages/story-localization/src/story-artifact-model.unit.test.ts` for:
  discriminated union narrowing;
  invalid full/short constraint mixing;
  locale and variant identity;
  adapters from current legacy shapes;
  StoryIR validation issue codes;
  artifact routing issue codes.
- Run:
  `pnpm test:unit -- packages/story-localization/src/story-artifact-model.unit.test.ts`
- Run narrow existing regression tests:
  `pnpm test:unit -- packages/story-localization/src/story-localization.unit.test.ts packages/story-localization/src/short-rewrite.unit.test.ts apps/cli/src/story-full-rewrite-command.unit.test.ts apps/cli/src/story-short-rewrite-command.unit.test.ts`
- Run typechecks:
  `pnpm --filter @mediaforge/story-localization typecheck`
  `pnpm --filter @mediaforge/cli typecheck`
- Run documentation/path checks:
  `test -f docs/plans/story-ir-and-artifact-variant-modeling.md`
  `rg -n "StoryIR|StoryArtifactVariant|StoryOutputConstraints" packages/story-localization/src docs/architecture/story-localization.md docs/plans/story-ir-and-artifact-variant-modeling.md`

## Assumptions And Risks

- The new model is additive and exported for future migration; current prompt builders will not be rewired in this task to avoid starting the production refactor.
- `docs.bak` remains ignored even though it contains the missing prompt templates.
- Some existing files are untracked in the worktree; implementation will avoid reverting or depending on unrelated untracked changes.
- "Final prompt compilation must consume the normalized model" is treated as a future migration constraint documented by this task, not a runtime behavior change in this task, because the user explicitly prohibited beginning the production refactor.
