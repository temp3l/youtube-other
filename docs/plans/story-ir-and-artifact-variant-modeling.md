# Story IR And Artifact Variant Modeling

## Scope

This document records the repository-grounded baseline and additive implementation shape for the isolated StoryIR and artifact variant model introduced in `packages/story-localization/src/story-artifact-model.ts`.

Packages and files involved:

- `packages/story-localization/src/story-artifact-model.ts`
- `packages/story-localization/src/story-localization.types.ts`
- `packages/story-localization/src/story-localization.schemas.ts`
- `packages/story-localization/src/story-production.ts`
- `packages/story-localization/src/short-rewrite.types.ts`
- `packages/story-localization/src/short-rewrite.schemas.ts`
- `packages/story-localization/src/language-profiles.ts`
- `packages/shared/src/episode-filesystem.ts`
- `apps/cli/src/index.ts`
- `apps/cli/src/story-localization-commands.ts`
- `apps/cli/src/story-full-rewrite-command.ts`
- `apps/cli/src/story-short-rewrite-command.ts`

## Current Full Call Graph

`apps/cli/src/index.ts` -> `registerStoryLocalizationCommands` / `registerStoryRewriteFullCommand` -> `createStoryLocalizationConfig` -> `localizeStoryEpisode` -> `parseCanonicalSourceStory` -> `extractCanonicalStoryFacts` -> `analyzeStorySource` / `buildStoryBible` / `buildOriginalityReview` / `buildRetentionPlan` -> `buildLocalizationPrompt` -> `loadAudioTemplate(system-prompt.md/full-story-prompt.md)` -> `generateStructuredStoryPackage` -> `callOpenAiStructured` -> validation and repair -> cache and artifact writes.

## Current Short Call Graph

`apps/cli/src/index.ts` -> `registerStoryRewriteShortCommand` -> `rewriteShortStories` -> `resolveShortRewriteInput` -> `buildShortRewritePrompt` -> `requestStructuredShortRewrite` -> OpenAI Responses API -> validation and repair -> sidecar, compatibility output, and manifest writes.

## Current Variant Identity And Routing

- Shared variant identity already exists in `packages/shared/src/episode-filesystem.ts` as `ContentVariant = "full" | "short"` and `EpisodeContext { episodeId, locale, variant }`.
- Story-localization currently keeps separate legacy shapes for generated full packages, short rewrite sidecars, and short rewrite manifest artifacts.
- Full rewrite model routing is driven by CLI options into `createStoryLocalizationConfig`, then into `StoryLocalizationConfig`.
- Short rewrite model routing is driven by CLI options into `ShortRewriteRunOptions` and the short rewrite service.

## Current Model And Config Behavior

- `packages/config` loads `.env` from the working directory and runtime overrides still take precedence.
- `packages/story-localization/src/language-profiles.ts` defines full and short narration defaults and short word ranges.
- `packages/story-localization/src/story-localization.schemas.ts` validates the generated full and mixed package shapes.
- `packages/story-localization/src/short-rewrite.schemas.ts` validates short sidecars, short artifacts, and manifests.

## Prompt Duplication

- Full and short prompt paths both depend on `system-prompt.md` and inject locale settings plus preservation constraints.
- The normalized model added here does not rewire prompt compilation or prompt loading.

## Validation, Repair, Cost, Persistence, And Resume

- Full rewrite generation validates schema shape, written-message preservation, titles, hashtags, filler drift, and preservation checklist behavior before persistence.
- Short rewrite generation validates JSON shape, word range, hook alignment, thumbnail limits, and editorial or production-label drift before persistence.
- Full rewrite resume behavior remains cache and output based.
- Short rewrite resume behavior remains manifest and sidecar based.
- Cost accounting remains usage-based where pricing is configured.

## Normalized Additive Model

The additive model in `packages/story-localization/src/story-artifact-model.ts` introduces:

- `StoryArtifactVariant = "full" | "short"`
- artifact owners: `narration | metadata | audio | scene-plan | image-plan | render | publication`
- `StoryArtifactIdentity`
- `FullStoryOutputConstraints`
- `ShortStoryOutputConstraints`
- discriminated `StoryOutputConstraints`
- `StoryIR` as a source-truth model for genre, fictionality, entities, immutable facts, chronology, central threat, central rule or mechanism, critical objects, written messages, climax, ending consequence, and allowed invention boundaries
- typed issue schemas for StoryIR and routing validation
- additive adapters for canonical facts, story-production artifacts, generated full packages, short rewrite sidecars, and short rewrite artifacts
- explicit adapter warnings where legacy artifacts lack enough information for the normalized model; generated full packages do not expose a target full-story word range, so that constraint is left absent instead of fabricated

## Risks And Non-Goals

- This work is additive only. It does not change CLI behavior, artifact layout, `.env` precedence, resume semantics, prompt text, or OpenAI call paths.
- Existing prompt builders and generation services still consume the current legacy shapes.
- `docs.bak` remains ignored even though it contains prompt-template copies.
- Final prompt compilation consuming the normalized model is a future migration, not part of this implementation.
