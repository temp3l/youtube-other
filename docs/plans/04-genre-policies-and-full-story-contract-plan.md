# Genre Policies And Full-Story Contract Plan

## Current State

- StoryIR/artifact baseline from prompt 02 exists:
  - `StoryIR`, `storyIrSchema`, artifact owner/variant schemas, full/short output constraints, and routing issue codes live in `packages/story-localization/src/story-artifact-model.ts`.
  - `adaptCanonicalStoryFactsToStoryIR()` and `adaptStoryProductionArtifactsToStoryIR()` currently hardcode `genre: "horror"`.
  - `validateStoryIR()` has limited checks for entity classification and supernatural rules in nonfiction.

- Genre policy status today:
  - Not centralized. Genre behavior is scattered or implicit across `story-artifact-model.ts`, `story-production.ts`, `canonical-facts.service.ts`, `generated-story-validator.ts`, and prompt text.
  - There is no supported genre enum for fictional supernatural, fictional psychological, historical mystery, true crime, documentary, folklore, unknown.
  - There is no reusable full-story genre policy object used by prompt building and validation.

- Full-story contract status today:
  - Partially separated at the artifact/variant layer, but no compact full-story contract exists.
  - `buildLocalizationPrompt()` in `packages/story-localization/src/localization-prompt-builder.ts` sends source narration, canonical facts, character map, and optional production context.
  - Sync `stories rewrite-full` config in `apps/cli/src/story-full-rewrite-command.ts` sets `includeEnglishShort: false` and `includeLocalizedShorts: false`, which avoids short generation for that command.
  - The broader localization service and batch path still retain legacy combined full+short schemas and short planned outputs when flags allow it.
  - The full-story contract is not explicitly separated from metadata/audio/scene/image/render/publication concerns because full response schemas still include audio instructions, thumbnail text, SEO, tags, hashtags, and visual direction as output fields, and the prompt contract is not a typed boundary.

## Gaps

- StoryIR uses `genre: string`, and adapters emit `"horror"`.
- Nonfiction policy is limited to one supernatural-rule check.
- Environmental/intelligent-threat boundaries, exact written-message policy, folklore tradition vs fact, psychological perceived vs confirmed reality, and evidence-led nonfiction constraints are not centralized.
- No `FullStoryContract` type derived from StoryIR plus cleaned source.
- Full prompt still receives raw-ish parsed narration and production context instead of a compact contract.
- Batch service still uses `generatedStoryPackageSchema` for localization, producing full+short outputs and requiring short cache checks.

## Remaining Tasks

1. Introduce centralized genre policy.
   - Likely files: `packages/story-localization/src/genre-policy.ts`, `story-artifact-model.ts`, `canonical-facts.service.ts`, `generated-story-validator.ts`, `index.ts`.
   - Add supported genre enum and `FullStoryGenrePolicy` lookup keyed by:
     - `fictional-supernatural`
     - `fictional-psychological`
     - `historical-mystery`
     - `true-crime`
     - `documentary`
     - `folklore`
     - `unknown`
   - Default unresolved legacy horror inputs to `unknown` or `fictional-supernatural` only when source disclosure/facts clearly justify it; do not keep hardcoded `"horror"` as policy.
   - Use policy in StoryIR adaptation, validation, and prompt construction.
   - Add validation for nonfiction/documentary/historical mystery/true crime invention bans and for environmental threats not being treated as intelligent unless established.

2. Add compact full-story contract.
   - Likely files: `full-story-contract.ts`, `localization-prompt-builder.ts`, `story-localization.schemas.ts`, `story-localization.service.ts`, `story-localization-batch-service.ts`.
   - Define `FullStoryContract` from StoryIR + cleaned source:
     - immutable facts, chronology, required entities, central threat/mystery, central rule/mechanism, critical objects, exact written messages, climax, final consequence, invention boundaries, target language/locale, full word range, WPM, duration target.
   - Ensure contract excludes metadata, audio, scene, image, render, publication, thumbnail, SEO, tags, hashtags, and short-only hook/beat constraints.
   - Make full prompt builder consume this contract instead of raw source Markdown or mixed production context.
   - Keep full output schema compatibility unless deliberately changed: if existing rendered full Markdown still needs metadata/audio fields, keep those as output artifact fields, not part of the input contract.

3. Remove full-story routing through short schemas where batch 1 requires it.
   - Likely files: `story-localization.service.ts`, `story-localization-batch-service.ts`, `story-localization.schemas.ts`.
   - Sync path already uses full-only schemas when `includeEnglishShort/includeLocalizedShorts` are false; make batch full-localization items use `localizedFullRewriteResponseSchema` and planned full outputs when shorts are out of scope.
   - Keep legacy localize behavior compatible for commands that still explicitly request shorts, but prevent full-only rewrite/batch requests from using short response schemas or short validation constraints.

4. Add targeted validation, no paid API calls.
   - Genre/full contract tests:
     - nonfiction cannot receive supernatural policy
     - environmental threats are not intelligent unless established
     - written messages remain exact
     - full contract excludes short hooks/beat constraints
     - full contract excludes metadata/audio/visual/publication fields
   - Suggested commands:
     - `pnpm test --filter @mediaforge/story-localization -- story-artifact-model`
     - `pnpm test --filter @mediaforge/story-localization -- story-localization`
     - Narrow CLI unit test for `apps/cli/src/story-full-rewrite-command.unit.test.ts` if CLI dry-run/report output changes.

## Decision Points

- Keep full output schemas/rendered Markdown compatible for now. Audio/metadata/visual fields may remain generated artifact fields, but they must not be part of the compact full-story input contract.
- Default unsupported/unclear genre to `unknown` with conservative invention boundaries. Only assign nonfiction/documentary/true-crime/historical policies from explicit disclosure or trusted facts.
- Keep legacy short-enabled localization behavior compatible, while enforcing full-only contracts for full rewrite paths.

## Done Criteria

- Full-story genre policy is centralized and deterministic.
- StoryIR/full contract uses supported genre policies rather than hardcoded `"horror"`.
- Full stories have an explicit compact contract independent of shorts.
- Full-story generation is not routed through short schemas, short word ranges, hooks, beat constraints, or short validation in full-only paths.
- Contract boundaries exclude metadata/audio/scene/image/render/publication concerns while preserving public artifact output compatibility.
