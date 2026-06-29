# Image Pipeline Hardening Review

## Executive Summary

The repository now has a real episode image pipeline, but it still sits between two architectural states:

- a newer structured image-planning and resumability model in `packages/image-generation/src/episode-image-pipeline.ts`;
- an older ad hoc path, prompt, and command model that still leaks through compatibility readers, local path helpers, and broad CLI surface area.

The result is not a single defect. It is a set of partially resolved mismatches:

- canonical image ownership has moved toward `shared/images/generated/`, but not every reader and writer uses one canonical path contract;
- visual planning is now typed, but fallback planning still derives too much directly from raw narration;
- semantic scene-difference checking exists, but synthetic shot/camera rotation is still used to manufacture uniqueness;
- resumability and hashing exist, but persisted audit records are still too thin for the required operator and migration workflows;
- `--concurrency` is exposed publicly, but scene generation still executes serially.

The repository has already solved enough to avoid a ground-up rewrite:

- typed visual plans and validation issues exist;
- canonical generated scene images can be migrated from legacy state paths;
- adjacent-scene merge/reuse policies exist;
- batch infrastructure for image generation already exists;
- the canonical singular `episode resume-images` CLI path is documented and tested.

The correct next step is not to replace the pipeline. It is to finish the contract:

1. freeze one canonical artifact layout;
2. route all image path ownership through one shared resolver;
3. split narration beat, visual plan, and provider request cleanly;
4. replace synthetic prompt-difference repair with semantic merge or semantic repair;
5. implement real concurrency and full audit records;
6. simplify the public CLI around the now-stable architecture.

## Repository Areas Inspected

- `packages/image-generation/src/episode-image-pipeline.ts`
- `packages/image-generation/src/episode-image-pipeline.unit.test.ts`
- `packages/image-generation/src/index.integration.test.ts`
- `packages/image-generation/src/image-batch-planner.ts`
- `packages/image-generation/src/image-batch-service.ts`
- `packages/shared/src/episode-filesystem.ts`
- `packages/shared/src/episode-filesystem.unit.test.ts`
- `packages/rendering/src/index.ts`
- `apps/cli/src/images-resume-command.ts`
- `apps/cli/src/episode-commands.ts`
- `apps/cli/src/episode-image-summary.ts`
- `docs/episode-image-generation.md`
- `docs/cli.md`

## Current Pipeline

### Planning pipeline

The current image planning flow is centered in `packages/image-generation/src/episode-image-pipeline.ts`:

1. `planEpisodeImageGeneration()`
2. `buildEpisodeScenePlans()`
3. `buildSceneVisualSpec()`
4. `buildPromptFromSpec()`
5. `validateSceneVisualSpec()` and `validatePrompt()`
6. `writeSceneVisualPlanArtifact()`
7. `writeManifest()` and `writeTextAtomic()` for prompt persistence

This is a substantial improvement over a prompt-only pipeline because it persists:

- a narration beat artifact;
- a typed scene visual spec;
- validation issues;
- renderability;
- prompt and scene hashes;
- per-scene manifest state.

Relevant symbols:

- `SceneNarrativeBeat`
- `SceneVisualSpec`
- `SceneVisualPlanIssueCode`
- `PersistedSceneVisualPlan`
- `SceneGenerationManifest`

All are defined in `packages/image-generation/src/episode-image-pipeline.ts`.

### Generation pipeline

The current generation flow is:

1. `generateEpisodeImages()`
2. `loadReferenceImages()`
3. `OpenAIImageGenerator.generate()`
4. `atomicWriteImage()`
5. `writeManifest()`

Generation supports two modes:

- text-only generation using `client.images.generate(...)`;
- reference-assisted generation using `client.images.edit(...)`.

This is documented in `docs/episode-image-generation.md` and implemented in `OpenAIImageGenerator.generate()`.

### Resume and bootstrap flow

The main CLI resumability entry point is `apps/cli/src/images-resume-command.ts`.

Current behavior:

- resolve or create `manifest.json`;
- resolve a scene plan from fallback locations;
- map CLI flags into image pipeline settings;
- call `generateEpisodeImages()`.

This gives the user a reliable entry point, but the scene-plan bootstrap flow still relies on fallback scanning of:

- `shared/scenes.json`
- `state/image-generation/scenes.json`
- `scenes.json`

That is useful during migration but still indicates multiple historical authority locations.

## Current Artifact Flow

### Current canonical or intended canonical artifacts

The code now treats the following as canonical or near-canonical:

- `episodes/<episode>/shared/characters.json`
- `episodes/<episode>/shared/images/character-references/<characterId>.png`
- `episodes/<episode>/shared/images/generated/<scene-filename>.png`
- `episodes/<episode>/state/image-generation/manifests/<sceneId>.json`
- `episodes/<episode>/state/image-generation/prompts/<sceneId>.txt`
- `episodes/<episode>/state/image-generation/visual-plans/<sceneId>.json`

Evidence:

- `sceneOutputPath()` in `packages/image-generation/src/episode-image-pipeline.ts`
- `resolveSceneImageCandidatePaths()` in `packages/shared/src/episode-filesystem.ts`
- `docs/episode-image-generation.md`

### Legacy compatibility artifacts

The code still reads or migrates legacy image outputs from:

- `episodes/<episode>/state/image-generation/images/<sceneId>.png`
- `episodes/<episode>/state/image-generation/images/<expectedFilename>.png`

Evidence:

- `resolveSceneImageCandidatePaths()` in `packages/shared/src/episode-filesystem.ts`
- `hydrateCanonicalSceneImage()` in `packages/image-generation/src/episode-image-pipeline.ts`

### Downstream consumers

Downstream rendering resolves scene images by checking:

1. an explicit `imageDir` expected filename;
2. canonical and legacy candidate paths from `resolveSceneImageCandidatePaths(...)`;
3. directory scan fallback for `scene.id__*.png`.

This is implemented in `resolveSceneImagePath()` in `packages/rendering/src/index.ts`.

The current renderer therefore tolerates migration states, but it still depends on multiple candidate strategies instead of one authoritative image reference manifest.

## Current Data Flow

1. Source story and scene plan already exist in the episode workspace.
2. `buildSceneVisualSpec()` derives a structured visual interpretation from scene fields plus fallback heuristics.
3. `deriveRenderability()` decides whether the beat should be direct, inferred, merged, or skipped.
4. `buildPromptFromSpec()` renders the provider-facing prompt string.
5. Validation runs before paid image generation.
6. Planning artifacts are persisted under `state/image-generation/`.
7. Generated scene images are written to `shared/images/generated/`.
8. Per-scene generation manifests are written under `state/image-generation/manifests/`.
9. Rendering resolves images using canonical and compatibility paths.

## Verified Findings

### 1. CLI naming is mostly resolved

The canonical documented path is now singular:

- `episode resume-images`

Compatibility alias still exists:

- `episode` command alias `episodes`

Evidence:

- `docs/cli.md`
- `apps/cli/src/images-resume-command.unit.test.ts`
- `apps/cli/src/episode-commands.unit.test.ts`

Conclusion:

- this part is functionally correct;
- compatibility remains explicitly supported;
- documentation drift is now partially guarded by tests.

### 2. Canonical image ownership has moved to `shared/images/generated/`

The current shared resolver returns canonical scene image paths under `shared/images/generated/`.

Evidence:

- `packages/shared/src/episode-filesystem.ts`
- `packages/shared/src/episode-filesystem.unit.test.ts`

Conclusion:

- generated scene images are now treated as reusable episode assets rather than transient-only state;
- this matches the likely downstream rendering contract for shared scene imagery.

### 3. The shared resolver is not yet the single source of truth

The repository has a shared path resolver, but the image pipeline still defines local path helpers:

- `sceneManifestPath()`
- `scenePromptPath()`
- `sceneVisualPlanPath()`
- `sceneOutputPath()`

Evidence:

- `packages/image-generation/src/episode-image-pipeline.ts`
- `packages/shared/src/episode-filesystem.ts`

Conclusion:

- the architecture is still split between shared resolver ownership and local service ownership;
- this increases migration and drift risk.

### 4. The shared resolver still exposes a legacy generated-image write path

`generatedImage()` in `createEpisodePathResolver()` still points to:

- `state/image-generation/images/<sceneId>.png`

while `resolveSceneImageCandidatePaths()` treats `shared/images/generated/` as canonical.

Evidence:

- `packages/shared/src/episode-filesystem.ts`

Conclusion:

- the resolver currently embeds two conflicting notions of “generated image”;
- this is a contract defect, not just a documentation issue.

### 5. Visual planning is now typed, but narration still leaks into visual source-of-truth fields

The code now has:

- `SceneNarrativeBeat`
- `PersistedSceneVisualPlan`
- typed validation issue codes

but fallback builders still promote `canonicalNarration` into:

- `visibleAction`
- `focalSubject`
- `environment` fragments

Evidence:

- `deriveVisibleAction()`
- `deriveFocalSubject()`
- `buildSceneContextFragments()`

Conclusion:

- the architecture has separated storage types;
- it has not fully separated planning responsibilities.

### 6. Scene-difference checking is improved but still uses synthetic cinematic churn

The repository now compares weighted visual semantics instead of whole prompt strings.

Evidence:

- `compareSceneSemantics()`
- `isNearIdenticalSceneComparison()`

However, `rewriteForDifference()` still manufactures distinction by changing:

- shot size;
- camera angle;
- focal-subject wording;
- composition wording.

Evidence:

- `rewriteForDifference()`

Conclusion:

- semantic comparison is directionally correct;
- automatic repair still violates the prompt’s requirement to avoid fake differences created only by camera rotation or wording churn.

### 7. Renderability policy exists and is the strongest completed architectural piece

The current pipeline explicitly models:

- `direct`
- `requiresInference`
- `mergeWithPrevious`
- `mergeWithNext`
- `skip`

and uses that model in both planning and generation.

Evidence:

- `SceneRenderability`
- `deriveRenderability()`
- `generateEpisodeImages()`
- merge/reuse tests in `episode-image-pipeline.unit.test.ts`

Conclusion:

- this is already close to the target design requested by the prompt;
- future work should preserve and refine it, not replace it.

### 8. Character continuity is still heuristic

Character usage inference currently does substring alias detection over:

- character name;
- role;
- tokenized variants.

Evidence:

- `inferCharactersForScene()`

Conclusion:

- this works for simple cases;
- it does not yet satisfy the requested collective identity, alias policy, and unresolved recurring-character rules.

### 9. Retry behavior exists, but scene concurrency does not

`OpenAIImageGenerator.generate()` supports:

- retry classification;
- bounded retry loop;
- exponential backoff with jitter.

Evidence:

- `isRetryableError()`
- `OpenAIImageGenerator.generate()`

But `generateEpisodeImages()` still processes scenes in a serial `for ... of` loop.

Conclusion:

- the public `--concurrency` flag overstates current behavior;
- throughput and rate-limit handling are not yet governed by a true scene-level concurrency controller.

### 10. Auditability is partial, not complete

The manifest records:

- prompt hash;
- scene hash;
- visual-plan hash;
- output checksum;
- retryable failure flag;
- renderability and material differences.

Evidence:

- `SceneGenerationManifest`

Telemetry records additional runtime data:

- request id;
- duration;
- cost;
- prompt hash;
- output checksum.

Evidence:

- `OpenAIImageGenerator.generate()`

Missing in persisted scene records:

- provider request artifact;
- provider response artifact;
- request correlation metadata persisted per scene;
- full failure taxonomy;
- explicit cache decision record.

Conclusion:

- the repository is resumable;
- it is not yet fully auditable at the per-attempt storage level requested by the prompt.

## Root Causes

### 1. The image pipeline was hardened incrementally instead of from a frozen storage contract

This created a mixed state where:

- canonical outputs moved;
- compatibility readers remained;
- some new path logic entered the shared layer;
- other path logic stayed local.

### 2. Visual planning was added on top of existing scene semantics instead of replacing old prompt heuristics entirely

This explains why typed visual plans coexist with narration-driven fallback field synthesis.

### 3. The repository still optimizes for “keep the old flows working” more than “one canonical ownership model”

This is visible in:

- fallback scene-plan discovery;
- legacy image hydration;
- broad CLI compatibility surface;
- renderer candidate-path search.

### 4. Prompt-difference repair was treated as a local optimization problem

Instead of choosing between:

- merge;
- reuse;
- evidence-shot reinterpretation;
- validation failure;

the pipeline still sometimes manufactures uniqueness by changing cinematic presentation.

### 5. Concurrency was exposed at the CLI/settings layer before the runtime coordination model existed

This creates a public API expectation that the implementation has not fully met.

## Correctness Risks

- conflicting image path contracts can cause future writers to regress back to legacy output paths;
- narration leakage into visual-plan fields can reintroduce abstract or repetitive prompts;
- substring-only character matching can omit recurring characters or assign the wrong character;
- synthetic difference rewriting can produce semantically weak scene churn instead of meaningful visual distinction;
- multiple compatibility readers can hide stale or migrated state longer than intended.

## Performance and Cost Risks

- no true scene concurrency means throughput is lower than the public interface suggests;
- synthetic difference rewriting can increase total image count instead of merging weak beats;
- incomplete cache layering makes future invalidation work harder to reason about;
- verbose planning artifacts risk prompt growth if provider-request rendering is not explicitly separated.

## Reliability Risks

- thin persisted attempt records make postmortem analysis harder after provider, filesystem, or resume failures;
- local path helpers in the image pipeline increase the chance of divergent future writes;
- compatibility hydration without one explicit migration phase can leave mixed-state episodes in the workspace longer than intended.

## Maintainability Risks

- image-path ownership is currently split across `@mediaforge/shared`, `@mediaforge/image-generation`, and rendering;
- the public image CLI surface is broader than the stable underlying model;
- documentation still contains stale behavior claims, especially around narration inclusion.

## Recommended Target Architecture

### 1. Canonical three-layer planning contract

The target per-scene model should be:

1. `SceneNarrativeBeat`
   - exact narration source;
   - source segment ids;
   - no visual invention.

2. `SceneVisualPlan`
   - validated concrete visual interpretation;
   - renderability decision;
   - character identities;
   - continuity anchors;
   - scene-difference semantics.

3. `ImageProviderRequest`
   - provider-specific prompt and generation options only;
   - no internal diagnostics;
   - no previous-scene prose;
   - no unrelated cache metadata.

### 2. One image artifact resolver

All image state and asset paths should be owned by `@mediaforge/shared`.

The image pipeline should not construct:

- manifest paths;
- prompt paths;
- visual-plan paths;
- generated-image paths;
- failure record paths;
- request/response record paths;

locally.

### 3. Canonical artifact ownership

Recommended ownership model:

- `shared/images/generated/`
  - canonical reusable scene images;
  - consumed by rendering;
  - safe to preserve across reruns;
  - not transient execution state.

- `shared/images/character-references/`
  - canonical character identity references for the episode.

- `state/image-generation/`
  - prompts, visual plans, manifests, checkpoints, failures, request/response audit records;
  - metadata and resumability state only;
  - legacy `images/` path remains read-compatible during migration only.

### 4. Semantic difference repair, not cinematic churn

If two adjacent scenes are too similar, the system should choose among:

- merge;
- reuse previous;
- reinterpret as evidence/reaction shot;
- fail validation for non-material difference.

It should not default to:

- rotating shot size;
- rotating camera angle;
- appending weak wording like “in a different pose”.

### 5. Explicit character continuity resolver

Recurring character detection should move into a dedicated typed resolver with:

- alias support;
- role support;
- collective identity rules;
- unresolved recurring-character validation;
- deliberate degradation rules when a face should remain hidden.

### 6. Real concurrency controller

The pipeline should separate:

- planning concurrency;
- provider concurrency;
- import/postprocessing concurrency.

All should be bounded and coordinated through a queue or pool, not implied by a setting alone.

### 7. Complete persisted audit records

Each scene should have enough persisted state to reconstruct:

- what was planned;
- what was validated;
- what request was sent;
- what provider attempt returned;
- whether the failure was retryable;
- what output was written;
- why the cache was reused or bypassed.

## Rejected Alternatives

### 1. Revert generated scene images back into `state/`

Rejected because:

- rendering and asset reuse semantics treat scene images as durable episode assets;
- the current canonical move to `shared/images/generated/` is directionally correct;
- pushing final binaries back into execution state would blur canonical asset ownership again.

### 2. Collapse visual planning back into a single final prompt string

Rejected because:

- the current typed planning work is one of the main improvements already achieved;
- resumability, validation, and difference checking are stronger with structured fields than with prompt strings.

### 3. Keep the current local path helpers in `episode-image-pipeline.ts`

Rejected because:

- path ownership is a cross-package contract, not a local implementation detail;
- rendering, batch planning, sync, CLI summary, and generation all touch the same artifacts.

### 4. Solve overlap defects primarily by provider-prompt wording tricks

Rejected because:

- the current prompt architecture already shows why wording-only uniqueness is weak;
- material distinction should be based on visual semantics, not on superficial prompt surface differences.

### 5. Remove compatibility paths immediately

Rejected because:

- tests already prove legacy state images exist and must hydrate cleanly;
- downstream commands still tolerate mixed workspaces;
- a compatibility reader is needed during the transition.

## Recommended Next Work

1. Freeze the canonical image artifact decision in a dedicated decision record.
2. Move all image path ownership into the shared resolver.
3. Add a typed `ImageProviderRequest` artifact and request hash.
4. Replace `rewriteForDifference()` with semantic repair or merge logic.
5. Implement a dedicated character continuity resolver.
6. Add real bounded scene concurrency.
7. Persist provider request, response, and failure audit artifacts.
8. Simplify the public image CLI around the stable architecture.

## Implementation Notes For Follow-Up Tasks

This review is intended to feed:

- `IMG-002` canonical image artifact-layout decision;
- `IMG-003` shared image resolver cleanup;
- `IMG-004` full audit record persistence;
- `IMG-005` real concurrency control;
- `IMG-006` narration/visual-plan split cleanup;
- `IMG-007` typed provider-request layer;
- `IMG-008` semantic scene-difference repair;
- `IMG-009` character continuity resolver.
