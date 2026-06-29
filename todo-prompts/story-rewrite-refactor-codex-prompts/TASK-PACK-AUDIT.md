# Task Pack Audit

## 1. Repository Findings

- The repository is a `pnpm` monorepo with `apps/cli` as the primary command surface.
- Story generation and localization live mainly in `packages/story-localization/src`.
- Shared logical full/short filesystem concepts already exist in `packages/shared/src/episode-filesystem.ts`.
- Current story languages are `en`, `de`, `es`, `fr`, and `pt`.
- Current locales are `en-US`, `de-DE`, `es-419`, `fr-FR`, and `pt-BR`.
- `packages/story-localization/src/prompt-template-loader.ts` expects `docs/templates/audio/*.md`, and `multilingual-story-localization-settings.ts` expects `docs/multilingual-story-localization-settings.md`; those files were not present in this checkout outside `docs.bak`.

## 2. Current Full-Story Call Graph

- `apps/cli/src/story-full-rewrite-command.ts` registers `stories rewrite-full`.
- The command resolves input with `resolveFullRewriteInput`, copies the source through `materializeCanonicalSourceStory`, builds config with `createStoryLocalizationConfig`, and calls `localizeStoryEpisode`.
- `localizeStoryEpisode` parses source, extracts canonical facts, builds story production artifacts, compiles prompts through `buildFullPromptConfig`, calls the OpenAI Responses API through `generateStructuredStoryPackage`, validates with generated-story validators, renders Markdown with `renderLocalizedFullStory`, and writes cache entries through `story-localization-cache`.
- Legacy `stories localize` in `apps/cli/src/story-localization-commands.ts` can also generate full outputs through `localizeStoryEpisode` and batch orchestration.

## 3. Current Short-Story Call Graph

- `apps/cli/src/story-short-rewrite-command.ts` registers `stories rewrite-short`.
- The command resolves an English full source through `resolveShortRewriteInput`, configures the short model from runtime config, and calls `rewriteShortStories`.
- `rewriteShortStories` copies the resolved source to the canonical source path, builds per-language payloads, compiles prompts through `buildShortRewritePrompt`, calls the Responses API, validates with short rewrite helpers, optionally calls `buildShortRewriteRepairPrompt`, writes Markdown/JSON sidecars, and merges `short-rewrite` manifests.
- Legacy `localizeStoryEpisode` can still request combined full+short schemas for localized outputs when `includeLocalizedShorts` is true.

## 4. Current Lineage Defects

- `stories rewrite-short` resolves from an English full story and can target `de`, `es`, `fr`, and `pt`; localized shorts therefore can derive from English instead of the matching localized full story.
- Short artifacts currently record `sourceLanguage: "en"` and `sourceSha256`, not `variant`, locale, parent localized full hash, StoryIR hash, or short-contract hash.
- Legacy combined schemas can generate localized full and localized short in one model call.
- Short generation prompt context includes the full source story payload rather than a compact short adaptation contract.
- Short resume eligibility cannot prove the parent localized full story is unchanged.

## 5. Missing Full-Story Concerns

- Full-story output is not modeled as a separate artifact variant across all schemas and manifests.
- Full narration prompts and rendered Markdown still couple narration with metadata/audio/visual fields through legacy package schemas.
- Full-story repair routing can reuse generic repair paths and needs purpose-aware routing.
- Full-story output-token exhaustion needs typed handling and failed-cost persistence.
- Full localization needs explicit canonical English parent hash and locale validation.

## 6. Missing Short-Story Concerns

- Shorts need a compact adaptation contract derived from validated locale full narration.
- Shorts need parent full hash, locale, variant, contract hash, compiler version, prompt hash, and model config in manifests.
- Short validation lacks issue-code coverage for hook deadline, parent mismatch, contradictions, missing climax/final consequence, orphaned references, and synopsis-like output.
- Short repair and regeneration need separate routes and budgets.
- Short metadata, audio, scene planning, vertical image strategy, rendering, and publication need independent stage ownership.

## 7. Duplicated Or Conflicting Tasks

- Old prompts mixed shorts into metadata/audio/visual separation instead of making shorts first-class.
- Old localization tasks described full lineage but not localized-short parentage.
- Old repair and retry prompts were split in a way that could leave routing, regeneration, and incomplete-response handling inconsistent.
- Old persistence and cost prompts did not require variant and parent hash in every relevant key.

## 8. Prompts Added

- `09-short-adaptation-contract-and-beat-extraction.md`
- `10-short-prompt-compiler-and-generation.md`
- `11-full-and-short-validation-matrix.md`
- `14-scene-image-render-publish-separation.md`
- `17-regression-and-integration-tests.md`
- `18-migration-documentation-and-cleanup.md`
- `19-final-cross-cutting-audit.md`
- `TASK-PACK-AUDIT.md`

## 9. Prompts Removed

The old numbered prompt files were replaced by the revised sequence. Removed old scopes include:

- `02-story-ir-and-runtime-validation.md`
- `04-genre-policies-and-story-contract.md`
- `05-modular-prompt-compiler.md`
- `07-canonical-english-generation.md`
- `08-localization-lineage-and-locale-validation.md`
- `09-repair-routing-and-full-regeneration.md`
- `10-incomplete-response-and-retry-hardening.md`
- `11-metadata-audio-shorts-and-visual-separation.md`
- `12-cost-controls-fingerprints-and-telemetry.md`
- `13-persistence-cache-and-resume.md`
- `14-regression-and-integration-tests.md`
- `15-migration-documentation-and-cleanup.md`
- `16-final-cross-cutting-audit.md`

## 10. Prompts Split Or Merged

- StoryIR was expanded into StoryIR plus artifact-variant modeling.
- Prompt compiler work was split into full-story compiler and short compiler.
- Localization lineage was narrowed to full localization, with short lineage moved to the short contract prompt.
- Validation was promoted to its own full/short matrix prompt.
- Repair, regeneration, incomplete response, and retry hardening were merged to keep routing rules consistent.
- Metadata/audio separation was split from scene/image/render/publish separation.
- Persistence/cache/resume was expanded to include invalidation.

## 11. Changed Execution Order

The pack now has 19 phases. Full-story architecture and generation are completed before short adaptation. Short contract and short compiler work happen before shared validation, repair, cost, persistence, and downstream media stages.

## 12. Changed Model Recommendations

- GPT-5.5 medium is recommended for repository analysis, StoryIR, lineage, prompt compilers, repair routing, persistence, and architecture audits.
- GPT-5.4 medium is recommended for focused implementation.
- GPT-5.4-mini is limited to isolated documentation, tests, and small fixes.
- High reasoning is reserved for final audit or unresolved architecture conflicts.

## 13. Remaining Uncertainties

- The checkout lacks the expected active prompt template files under `docs/templates/audio` and active multilingual settings under `docs/`; implementation must resolve whether they are generated, intentionally omitted, or stale references.
- The desired physical artifact layout should adapt to existing compatibility requirements; logical identity should be variant-aware even if physical paths remain legacy-compatible.
- Whether localized short adaptation needs a separate `.env` model from English short adaptation should be decided after implementation tests and cost/routing analysis.

## 14. Exact List Of Updated Files

- `todo-prompts/story-rewrite-refactor-codex-prompts/README.md`
- `todo-prompts/story-rewrite-refactor-codex-prompts/01-repository-analysis-and-baseline.md`
- `todo-prompts/story-rewrite-refactor-codex-prompts/02-story-ir-and-artifact-variant-modeling.md`
- `todo-prompts/story-rewrite-refactor-codex-prompts/03-source-cleaning-and-provenance.md`
- `todo-prompts/story-rewrite-refactor-codex-prompts/04-genre-policies-and-full-story-contract.md`
- `todo-prompts/story-rewrite-refactor-codex-prompts/05-full-story-prompt-compiler.md`
- `todo-prompts/story-rewrite-refactor-codex-prompts/06-token-budgeting-and-preflight.md`
- `todo-prompts/story-rewrite-refactor-codex-prompts/07-canonical-english-full-generation.md`
- `todo-prompts/story-rewrite-refactor-codex-prompts/08-full-localization-lineage-and-locale-validation.md`
- `todo-prompts/story-rewrite-refactor-codex-prompts/09-short-adaptation-contract-and-beat-extraction.md`
- `todo-prompts/story-rewrite-refactor-codex-prompts/10-short-prompt-compiler-and-generation.md`
- `todo-prompts/story-rewrite-refactor-codex-prompts/11-full-and-short-validation-matrix.md`
- `todo-prompts/story-rewrite-refactor-codex-prompts/12-repair-routing-regeneration-and-retry-hardening.md`
- `todo-prompts/story-rewrite-refactor-codex-prompts/13-metadata-and-audio-stage-separation.md`
- `todo-prompts/story-rewrite-refactor-codex-prompts/14-scene-image-render-publish-separation.md`
- `todo-prompts/story-rewrite-refactor-codex-prompts/15-cost-controls-fingerprints-and-telemetry.md`
- `todo-prompts/story-rewrite-refactor-codex-prompts/16-persistence-cache-resume-and-invalidation.md`
- `todo-prompts/story-rewrite-refactor-codex-prompts/17-regression-and-integration-tests.md`
- `todo-prompts/story-rewrite-refactor-codex-prompts/18-migration-documentation-and-cleanup.md`
- `todo-prompts/story-rewrite-refactor-codex-prompts/19-final-cross-cutting-audit.md`
- `todo-prompts/story-rewrite-refactor-codex-prompts/TASK-PACK-AUDIT.md`
