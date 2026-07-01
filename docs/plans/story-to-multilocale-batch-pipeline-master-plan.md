# Story To Multilocale Batch Pipeline Master Plan

## 1. Executive Summary

This plan recommends adding a unified story workflow above the existing CLI and package services rather than replacing stable package internals. The safest short-term architecture is Strategy A: a conservative orchestration wrapper in `apps/cli` plus a new workflow-domain package that persists stage outcomes, calls existing story, quality, image, metadata, audio, render, and publication owners, and records partial success. The strongest long-term architecture is Strategy C plus Strategy B: a durable dependency graph whose stage outputs populate a versioned canonical story package.

The unified workflow input is one original English full story. Canonical locales are exactly `en`, `de`, `fr`, `es`, and `pt`. Current source code already defines `LanguageCode` and shared `LocaleCode` as this set; no production TypeScript locale enum includes `sp`. The plan still requires a compatibility guard so `sp` cannot create a second Spanish branch from CLI input, persisted manifests, cache keys, batch items, or artifact paths.

The largest missing behavior is critical English fallback: current English rewrite failure stops downstream story localization. Future workflow must preserve rewrite provider failures as typed outcomes, then validate and quality-gate the original source as a separate fallback candidate. Provider failure must never imply low story quality.

## 2. Repository Instructions Discovered

- Root `AGENTS.md` requires `pnpm` monorepo assumptions, `apps/cli` as the primary operational surface, code over docs when conflicts occur, targeted searches, no root `README.md` architecture reliance, and no broad validation for docs-only work.
- `packages/story-localization/AGENTS.md` adds story-localization guardrails: focused Vitest first, no paid providers, no automatic fixture regeneration, and individual assertions for lineage, schemas, validation, cache, and provider-call fields.
- Relevant architecture docs inspected: `docs/architecture/system-overview.md`, `episode-production-pipeline.md`, `story-localization.md`, and `media-assets-and-delivery.md`.
- Relevant existing plans inspected by topic: Tasks 07-16 and 19 for canonical English, localization lineage, shorts, validation, repair/retry, media separation, cost/telemetry, persistence/cache/resume, and story production analysis.

## 3. Current Architecture

- `apps/cli` is the stable operator surface.
- `@mediaforge/story-localization` owns full rewrite, localization, short adaptation, prompt compilation, response schemas, deterministic validation, preflight, cache, batch, retry routing, and story production analysis.
- `@mediaforge/shared` owns normalized episode IDs, locale codes, content variants, path resolvers, atomic writes, workspace containment, and media artifact path helpers.
- `@mediaforge/persistence` provides SQLite tables for episode manifests, pipeline runs, and step runs, but story localization primarily persists filesystem artifacts.
- `@mediaforge/image-generation`, `@mediaforge/metadata`, `@mediaforge/speech`, `@mediaforge/rendering`, and `@mediaforge/youtube-upload` already own downstream media stages with separate manifests and fingerprints.
- `@mediaforge/observability` owns execution telemetry and cost aggregation.

## 4. Current Workflow

Current story rewrite flow in `localizeStoryEpisode`:

1. Resolve and parse canonical English source.
2. Persist source analysis, story bible, originality review, protected elements, and retention plan under `.localization-cache/production/...`.
3. Attempt canonical English full rewrite.
4. Validate schema and deterministic full-story constraints.
5. Persist `en/full/canonical-full.json`, `en/full/script.md`, root compatibility `script.md`, and `generation-manifest.json`.
6. Optionally generate English short.
7. Loop localized full generation by configured language.
8. In legacy mixed mode, localized full and short are produced in the same provider response.
9. Persist cache entries and batch-compatible artifacts.

Current quality analysis flow is separate:

1. `stories analyze --episode --language --format full` resolves a persisted full story.
2. It requires current lineage for English canonical or localized full.
3. It calls OpenAI Responses with `storyProductionAnalysisResponseSchema`.
4. It applies deterministic production gate checks and writes `story-production-analysis.json`.

Current downstream media flow is separate and consumes validated narration or scene artifacts; images and render have their own resume/failure behavior.

## 5. Current Package Map

- `apps/cli`: command registration, global runtime config, existing `stories`, `episode`, `images`, `thumbnails`, render, metadata, and upload commands.
- `packages/story-localization`: source discovery/cleaning, full rewrite, localization, short rewrite, prompt compiler, schemas, validation, production analysis, cache, batch, retry routing, cost tracking.
- `packages/shared`: canonical locale set, path resolver, safe IDs, atomic IO, workspace containment.
- `packages/persistence`: SQLite operational history; not yet sufficient for workflow DAG state.
- `packages/image-generation`: scene visual plans, image prompts, shared images, image batch manifests, image resume, shorts image strategy, thumbnails.
- `packages/metadata`: YouTube metadata generation, metadata manifest, parent narration fingerprint.
- `packages/speech`: audio instructions, voice settings, TTS, voice/model fingerprints.
- `packages/rendering`: FFmpeg local/remote rendering, clip/final manifests, render dependencies.
- `packages/youtube-upload`: publication reports and upload dependency fingerprints.
- `packages/observability`: telemetry, usage, pricing, cost estimates.

## 6. Current Command Map

- `stories localize`: older full localization command in `story-localization-commands.ts`; defaults to `de,es,fr,pt`, batch mode, optional English short.
- `stories batch prepare|submit|refresh|import|retry|cancel|status`: existing OpenAI Batch API management for story localization.
- `stories rewrite-full`: sync canonical English full rewrite plus selected localized full outputs; currently `includeEnglishShort=false`, `includeLocalizedShorts=false`.
- `stories rewrite-short`: short generation for `en,de,es,fr,pt`.
- `stories analyze|inspect|status`: full-story production analysis only.
- `episode english|localized|short|status|resume-images|review ...`: legacy operational path for episode production and review.
- `images resume`, `images sync-shared`, thumbnail, render, metadata, and upload commands remain separate downstream surfaces.

Recommended unified command:

```bash
node apps/cli/dist/index.js stories pipeline \
  --episode <episode> \
  --locales en,de,fr,es,pt \
  --formats full,short \
  --quality-profile production \
  --resume \
  --continue-on-locale-failure \
  --batch text \
  --json
```

The command should support `--dry-run`, `--estimate-cost`, `--max-budget-micros`, `--retry-failed`, `--retry-locale <locale>`, `--retry-stage <stage-id>`, `--start-from`, `--stop-after`, `--force`, `--skip-images`, `--skip-render`, `--skip-publish`, `--workflow-id`, `--execution-id`, `--model`, and `--reasoning-effort` only where these do not duplicate stable config ownership.

## 7. Current Artifact Map

- Original source: materialized under episode `source/` by `stories rewrite-full`; discovered from content pack by story localization commands.
- Canonical English full: `episodes/<episode>/en/full/canonical-full.json`, `en/full/script.md`, root `script.md`, and `en/full/generation-manifest.json`.
- Localized full: `episodes/<episode>/<locale>/full/script.md` plus `.localization-cache/production/.../<locale>-full-narration-result.json`.
- English/localized shorts: `episodes/<episode>/<locale>/short/script.md` plus short sidecars/manifests from `short-rewrite.persistence.ts`.
- Production analysis: `episodes/<episode>/<locale>/full/story-production-analysis.json`.
- Story cache: `episodes/<episode>/.localization-cache/entries`, `facts`, `preflight`, and `production`.
- Batch state: `.batch/` under output roots, plus image batch state under `state/image-generation`.
- Images: shared generated images and `state/image-generation/{manifests,prompts,visual-plans,provider-requests,provider-responses,failures,checkpoints}`.
- Metadata, thumbnails, audio, renders, and upload reports use locale/variant roots through `createEpisodePathResolver`.

## 8. Current Persistence Map

- Filesystem artifacts are authoritative for story localization and media resume.
- SQLite stores `episodes`, `pipeline_runs`, and `step_runs`, but does not model a typed workflow DAG.
- Story batch manifests are durable JSON plus an index at `.batch/batch-index.json`.
- Short manifests use file locks through `withFileLock`.
- Image manifests persist per-scene state and retryability.
- Rendering and upload persist dependency fingerprints in manifests/reports.

Recommended source of truth: hybrid persistence. A new workflow manifest JSON under `episodes/<episode>/state/story-workflow/workflows/<workflowId>.json` is canonical for stage outcomes and artifact lineage; SQLite mirrors execution summaries for listing and status. Atomic writes and file locks are required for manifest mutation. SQLite transactions should be used only for mirror/index updates.

## 9. Current Quality-Gate Map

- `story-production-analysis.ts` defines verdicts `READY`, `READY_WITH_MINOR_EDITS`, `REVISION_REQUIRED`, `REWRITE_REQUIRED`, `BLOCKED`.
- `deriveStoryProductionVerdict` passes only `READY` and `READY_WITH_MINOR_EDITS`; the latter passes with minor-warning semantics.
- Blocking findings include narrative contradiction, timeline/causality issues, publishing blockers, copyright/provenance blockers, localized plot-critical drift, missing/stale lineage, fingerprint mismatch, and invalid structured analysis.
- Production analysis supports only `format: "full"` today.

Target:

- Full and short must each have independent deterministic validation, story-quality analysis, and quality-gate decisions.
- Full pass does not imply short pass.
- Fallback source acceptance should use the same production gate initially, with an option to configure stricter fallback profiles later.
- Deterministic validation precedes OpenAI quality analysis. If deterministic validation fails permanently, quality analysis may be skipped and the gate blocked with a local-validation failure.

## 10. Current Retry And Fallback Behavior

- Full rewrite/localization uses retry routing around incomplete provider responses and deterministic validation; `canRepair` is currently false for full generation in the inspected paths.
- Short rewrite supports repair/regeneration, persisted failed request metadata, duplicate failed fingerprint suppression, and resume.
- Speech supports fallback models and retryable quality/provider errors.
- Rendering supports remote retry and optional local fallback.
- Image generation persists retryable and non-retryable failures.
- English rewrite failure currently blocks downstream story localization. There is no typed source-fallback acceptance flow.
- Locale generation failures are accumulated and do not necessarily stop other locale loops, but there is no explicit persisted localized fallback hierarchy.

## 11. Current Batch Capabilities

- Story text batching exists for `/v1/responses` through `story-localization-batch-service.ts`, `story-localization-batch-storage.ts`, and `story-localization-openai-batch.ts`.
- Custom IDs are deterministic: `dte:<episodeNumber>:<operation>:<language-or-none>:<sourceHash8>:<configHash8>[:rN]`.
- Batch item statuses include planned, submitted, API success/failure, expired, schema-invalid, content-invalid, repair-required, preflight-failed, persisted, and skipped-cached.
- Story batch index supports statuses, retryable failure detection, import requirements, and repair/rebuild.
- Image provider batching exists for `/v1/images/generations` and `/v1/images/edits` with per-item image failure categories.
- No provider-side batch owner should become the workflow correctness owner; batch is an execution mode for eligible stage items.

## 12. Architectural Deficiencies

- No single workflow stage graph covers full, short, locales, audio, metadata, images, render, publish, status, inspect, cost, and partial success.
- English provider failure and quality failure are conflated at the orchestration level because downstream work only sees missing canonical English output.
- Original-source fallback is missing.
- Localized fallback hierarchy is not explicit or typed.
- Story production analysis is full-only; short quality gate is not implemented.
- Legacy mixed localized full+short generation couples localized short validity to the full provider response.
- Multiple media-stage dependency schemas are duplicated in image, rendering, and upload packages.
- Status/inspect surfaces do not yet expose end-to-end partial success.
- SQLite does not store typed workflow state, attempts, fallbacks, warnings, or provider batch reconciliation.
- Some legacy episode commands list only `en|de|es|fr` in help strings and omit `pt`.

## 13. Target Requirements

- One original English full story drives English full/short and `de/fr/es/pt` full/short.
- Canonical locale set is exactly `en,de,fr,es,pt`; `sp` is rejected or migrated to `es` before artifact identity.
- English rewrite is attempted first; rewrite failure triggers original-source validation and quality gate.
- Fallback provenance and original rewrite failure are both persisted.
- Locale branches are independent and may use persisted fallback only after validation and fallback gate acceptance.
- Shared image generation depends on accepted canonical English visual prerequisites, not locale success.
- Full and short gates are independent.
- Audio, metadata, image, render, and publish failures are isolated by dependency.
- Provider batch failures can be retried per item.
- Workflow state is durable, resumable, idempotent, and cache-invalidation aware.

## 14. Target Workflow

1. Ingest original English full source.
2. Attempt canonical English full rewrite.
3. Validate provider schema and deterministic full constraints.
4. Run production story-quality analysis.
5. Gate canonical English full.
6. If rewrite generation fails, evaluate original source fallback through deterministic validation and production gate.
7. When canonical English full is accepted, branch:
   - English short adaptation and quality gate.
   - `de/fr/es/pt` full localization branches.
   - language-neutral visual model, scene extraction, image prompt planning, shared image generation.
8. For each accepted localized full, run localized short adaptation and independent gates.
9. For each accepted story format, run audio, subtitles/captions, metadata, thumbnails, render, and publication independently.
10. Persist all outcomes, attempts, costs, warnings, fingerprints, provider IDs, batch IDs, and lineage.

## 15. English Rewrite Fallback

Normal path:

- Load original English full story.
- Attempt canonical English full rewrite.
- Validate response schema and deterministic local constraints.
- Run story-quality analysis.
- Apply production gate.
- On pass, persist canonical English story with provenance `generated`, validation/quality artifacts, model, prompt, reasoning, cost, and fingerprints.

Failure path:

- Applies to provider failure, timeout, transport error, quota, rate limit, malformed response, parse failure, schema failure, retry exhaustion, preflight infrastructure failure, and other generation/infrastructure failures.
- Persist a typed rewrite failure outcome with category such as `rewrite-provider-failure`, `rewrite-timeout`, `rewrite-rate-limited`, `rewrite-quota-failure`, `rewrite-schema-invalid`, or `persistence-failed`.
- Run deterministic full-story validation against the original source.
- Run `story-production-analysis` against a source-fallback artifact or an analysis source resolver that explicitly supports `provenance: source-fallback`.
- Apply the production gate.
- If accepted, persist canonical English fallback with provenance `source-fallback`, preserve the rewrite failure separately, emit a warning, and continue all valid downstream stages.
- If rejected, persist `source-fallback-rejected`, persist gate result, block canonical English full, block dependents, and do not generate images.

## 16. Locale Fallback

For `de`, `fr`, `es`, and `pt`, localization failure must block only that locale unless a valid fallback is accepted.

Repository-grounded fallback candidates:

1. Current accepted localized full artifact for the same locale and canonical English fingerprint, if present.
2. Previous workflow accepted artifact for the same locale recorded in workflow manifest, if its parent canonical fingerprint still matches.
3. Existing cache entry only if all cache key and output files match and validation/gate artifacts are current.
4. Manually supplied localized story only if an explicit future CLI flag records provenance and path; this does not exist today and must be a later additive feature.

Not valid today: another locale, raw translation-stage output before rewriting unless the repo gains such an artifact, failed localization output, or legacy compatibility markdown without current lineage.

Fallback precedence is newest accepted same-locale artifact first, then current cache-compatible artifact, then explicit manual artifact. Every fallback must run deterministic locale validation and story-quality analysis, then a fallback quality gate. Provenance must be `localized-fallback`; original localization failure remains attached to the locale branch.

## 17. Full And Short Independence

Required states:

- `full accepted`, `short accepted`.
- `full accepted`, `short blocked by quality gate`.
- `full accepted`, `short generation failed`.
- `full blocked`, `short skipped dependency-blocked`.
- `story accepted`, `audio failed`, `metadata accepted`, `render blocked because audio is missing`.
- `locale blocked`, shared images generated from accepted English content.

Dependencies:

- Full story: source/canonical parent, prompt/schema/model, validation, quality gate.
- Short story: accepted matching-locale full story, short extraction, short contract, prompt/schema/model, validation, quality gate.
- Audio: accepted story format plus voice/TTS settings.
- Metadata: accepted story format plus scene/metadata prompt dependencies.
- Render: accepted story, audio, subtitles/captions as configured, scene plan, images, render profile.
- Publish: render, metadata, thumbnail, credentials, publication policy.

## 18. Image-Generation Dependency

Safest boundary: shared image generation starts after accepted canonical English full story, English production gate pass, and successful language-neutral visual preparation consisting of scene extraction and image-plan/prompt generation. It must not wait for `de/fr/es/pt`.

Language-neutral artifacts:

- Canonical English full narrative.
- StoryIR, narrative beats, entities, characters, locations, continuity data.
- Scene plan and visual plan when generated from accepted English and stripped of localized text.
- Shared character references, landscape scene images, image prompts without localized title-card text.

Shared images:

- Full video scene images generated from accepted English visual representation.
- Short videos may reuse full images through smart crop, pan-and-scan, or blurred-fill where the existing shorts strategy allows; regenerated vertical images are variant-specific but still language-neutral unless text is embedded.

Locale-specific images:

- Localized title cards, localized thumbnails, images with localized text, caption burn-ins, and any scene image whose required visible text is localized.

Localized narration timing may affect render pacing and scene durations but should not invalidate shared images unless timing changes force a scene split/merge or visual plan changes. Locale-only voice, metadata, or text prompt changes must not invalidate shared images.

## 19. Strategy A: Conservative Orchestration Wrapper

Architecture: add `stories pipeline` in `apps/cli` and a workflow package that wraps existing commands/services with a typed stage graph and manifest. Existing services remain owners.

Benefits: lowest regression risk, uses current artifacts, easiest migration, preserves commands, enables partial success and fallback routing quickly.

Limitations: some duplicate schemas remain, filesystem-first state persists, wrapper must adapt inconsistent result shapes.

Migration effort: medium.

Regression risk: low to medium.

Cost savings: mainly cache reuse, avoided duplicate generation, and batch grouping where existing services support it.

Testing impact: focused unit/contract tests plus integration around wrapper behavior.

Deprecation impact: legacy commands delegate later, not removed.

## 20. Strategy B: Canonical Story Package

Architecture: introduce a versioned canonical package owned by `@mediaforge/story-localization` or new `@mediaforge/story-workflow`. It contains original source, accepted canonical English full, accepted English short, localized full/shorts, validation, quality gates, lineage, provenance, continuity data, scenes, visual representation, prompt versions, fingerprints, costs, warnings, and failures.

Serialization: strict JSON with Zod runtime schemas and schema version migrations.

Benefits: clear contracts for cheaper implementation models and downstream owners.

Limitations: schema migration work and compatibility adapters needed.

Recommended ownership: workflow identity/state in new `@mediaforge/workflow`; story package schema in `@mediaforge/story-localization` until extracted.

## 21. Strategy C: Persisted Dependency Graph

Architecture: durable DAG stage instances such as `rewrite-full:en`, `quality-full:en`, `localize-full:de`, `rewrite-short:de`, `audio:de:full`, `render:de:short`.

Supports partial success, locale/format isolation, retries, resume, cache reuse, dependency blocking, batch grouping, cancellation, concurrency, budget limits, invalidation, status inspection, and auditability.

This is the strongest long-term architecture. It should not be built as a greenfield pipeline engine first; implement a minimal graph manifest and grow it behind Strategy A.

## 22. Strategy D: OpenAI Batch API Hybrid

Architecture: workflow groups eligible OpenAI-backed stage items into provider batches, persists batch manifests, polls/reconciles results, validates each item, retries failed items individually, and falls back to synchronous execution when requested.

Provider batch is suitable for localization full stories, potentially quality analysis, metadata, and image generation where latency is acceptable and per-item correlation is robust. It is not suitable for TTS, rendering, publishing, local validation, cache reads, or stages needing immediate gating.

## 23. Strategy Comparison

| Strategy | Safety | Long-term strength | Effort | Regression risk | Recommendation |
| --- | --- | --- | --- | --- | --- |
| A Conservative wrapper | High | Medium | Medium | Low | First implementation |
| B Canonical package | Medium | High | Medium-high | Medium | Add incrementally |
| C Persisted DAG | Medium | Highest | High | Medium-high | Long-term target |
| D Batch hybrid | Medium | Medium-high | Medium | Medium | Execution optimization, not correctness owner |

## 24. Recommended Architecture

Short term: Strategy A with a minimal persisted DAG manifest, typed outcomes, fallback routing, status/inspect JSON, and delegation to existing services.

Long term: Strategy C with Strategy B canonical package and Strategy D as an execution mode.

## 25. Migration Path

1. Add canonical locale normalization and `sp` rejection/migration guard.
2. Add workflow schema and manifest persistence.
3. Implement English rewrite fallback as isolated stage wrapper.
4. Implement production quality gate adapter for full and short outcomes.
5. Add locale branch isolation and fallback candidate resolver.
6. Add image dependency boundary from accepted English visual prerequisites.
7. Wire downstream audio, metadata, thumbnail, render, publish stage adapters.
8. Add batch grouping and reconciliation for eligible stages.
9. Add status/inspect unified reporting.
10. Delegate legacy commands to workflow stages where safe.
11. Deprecate old all-in-one mixed localized full+short path after parity tests.

## 26. Typed Domain Model

See `story-pipeline-schema-design.md`. Required types are discriminated unions with runtime validation: `WorkflowId`, `ExecutionId`, `StageId`, `ArtifactId`, `ProviderBatchId`, `EpisodeId`, `Locale`, `StoryFormat`, `StageType`, `ArtifactProvenance`, `StageOutcome<T>`, `StageFailure`, `StageWarning`, `QualityGateDecision`, `ArtifactLineage`, `WorkflowManifest`, `LocaleWorkflowResult`, `FormatWorkflowResult`, `BatchSubmission`, `BatchItemState`, `CostMetrics`, `CacheMetadata`, and `FingerprintInputs`.

## 27. Failure Taxonomy

See schema design for fields. Categories must include:

`source-missing`, `source-invalid`, `rewrite-provider-failure`, `rewrite-timeout`, `rewrite-rate-limited`, `rewrite-quota-failure`, `rewrite-schema-invalid`, `rewrite-local-validation-failed`, `rewrite-quality-gate-failed`, `source-fallback-accepted`, `source-fallback-rejected`, `localization-provider-failure`, `localization-schema-invalid`, `locale-validation-failed`, `locale-quality-gate-failed`, `locale-fallback-accepted`, `locale-fallback-rejected`, `short-generation-failed`, `short-validation-failed`, `short-quality-gate-failed`, `audio-generation-failed`, `metadata-generation-failed`, `scene-extraction-failed`, `visual-model-failed`, `image-generation-failed`, `thumbnail-generation-failed`, `render-failed`, `publish-failed`, `persistence-failed`, `cache-corrupt`, `manifest-version-incompatible`, `fingerprint-mismatch`, `dependency-blocked`, `budget-exceeded`, `policy-blocked`, `copyright-blocked`, `provenance-blocked`, `cancelled`, `skipped`, `resumed`, and `cache-reused`.

Provider/infrastructure failures are retryable with capped exponential backoff. Deterministic validation, policy, provenance, copyright, and quality-gate failures are not automatically retried.

## 28. Persistence

Workflow manifest fields:

- `workflowId`, `executionId`, `episodeId`, source artifact/fingerprint, locales, formats, workflow schema version, artifact schema versions, prompt/model/reasoning settings, quality profile, stage graph, dependencies, outcomes, attempts, timestamps, artifacts, lineage, fallback decisions, provider request/batch IDs, token usage, cost estimates, actual costs, cache hits, invalidations, resume events, warnings, failures, and final result.

Package ownership:

- New `@mediaforge/workflow` owns generic DAG schema and store.
- `@mediaforge/story-localization` owns story artifact schemas and quality adapters.
- `@mediaforge/shared` owns IDs, locale normalization, safe paths.

Atomic writes use existing `writeJsonAtomic`; locking uses `withFileLock` or a shared equivalent. Concurrent execution protection requires per-workflow and per-episode locks. Corruption recovery reads last valid manifest and writes quarantine copy for malformed state.

## 29. Cache And Invalidation

See `story-pipeline-cache-invalidation-matrix.md`. Key principle: invalidate by dependency owner, not globally.

Examples:

- English source changes invalidate canonical English, all localizations, all shorts, visual representation, scenes, shared images, audio, metadata, renders, thumbnails, and publication.
- German voice changes invalidate only German audio and dependent German renders.
- Spanish metadata prompt changes invalidate only Spanish metadata and dependent publication.
- Visual style changes invalidate visual prompts, images, thumbnails using those images, and dependent renders, but not narration/audio/metadata.

## 30. CLI

Add `stories pipeline` and `stories workflow status|inspect|retry` or subcommands under the same command if consistent with commander usage. Use current `stories` group rather than root `story` singular.

Legacy commands remain compatible:

- `stories rewrite-full` delegates to `rewrite-full:en` and selected `localize-full:*` stages after migration.
- `stories rewrite-short` delegates to `rewrite-short:<locale>`.
- `stories analyze/status/inspect` delegates to quality stages.
- `episode` media commands remain until render/publish parity is proven.

## 31. Concurrency

Recommended scheduler: dependency-driven hybrid.

- English rewrite and fallback gate run serially.
- Localization branches run parallel with concurrency limits and independent failure handling.
- Quality checks can batch or parallelize after each story candidate.
- Shorts run after matching full acceptance.
- Metadata and audio are sibling stages after story acceptance.
- Image generation starts after accepted English visual prerequisites, with provider/image concurrency limits.
- Rendering is CPU/disk heavy; limit local/remote concurrency separately.
- Publishing is terminal and should remain serial or low-concurrency per channel.

Avoid retry storms with per-stage max attempts, jittered backoff, and budget gates.

## 32. Cost Controls

Preflight estimates must be per workflow, stage, locale, and format. Budget limits:

- workflow budget: stop scheduling new provider stages when exceeded;
- stage budget: block that stage and dependents;
- locale budget: block that locale but continue others;
- image budget: allow text/story stages to continue, block image/render dependents as needed.

Actual reconciliation uses provider usage, batch outputs, image cost records, speech duration pricing, and telemetry reports. Reports must show cache savings and provider batch savings separately.

## 33. Observability

Every stage emits:

`workflowId`, `executionId`, `episodeId`, `stageId`, `stageType`, `locale`, `format`, `attempt`, `status`, `provenance`, `qualityStatus`, `fallbackUsed`, `provider`, `model`, `reasoningEffort`, `providerRequestId`, `providerBatchId`, `cacheStatus`, `durationMs`, `inputTokens`, `outputTokens`, `estimatedCostMicros`, `actualCostMicros`, `failureCategory`, `retryability`, `artifactPath`, and `artifactFingerprint`.

Reports must support human and JSON output and clearly show `SUCCESS`, `PARTIAL_SUCCESS`, `BLOCKED`, `FAILED`, and `CANCELLED`.

## 34. Security

Required protections:

- Treat story text as untrusted content in prompts.
- Normalize episode IDs, locales, formats, and paths through existing shared helpers.
- Reject path traversal and unsafe filenames.
- Validate provider schemas and JSON sizes.
- Detect response truncation and malformed JSON.
- Redact secrets and provider payloads in logs.
- Use atomic writes and locks.
- Prevent duplicate workflow execution per episode unless explicitly allowed.
- Avoid unsafe shell construction; use existing process-runner and argument arrays.
- Preserve provenance, copyright, and policy failures as permanent unless manually overridden by supported future policy.

## 35. Testing

See `story-pipeline-test-strategy.md`. Required groups: unit, integration, contract, and end-to-end tests. Tests must mock providers and prove English fallback, locale isolation, image independence, full/short independence, batch item retry, resume, invalidation, budgets, and `sp` rejection/migration.

## 36. Risks

- Implementing a full scheduler too early could duplicate existing package behavior.
- Reusing compatibility markdown as fallback without lineage can mask stale artifacts.
- Provider-side batch latency may be operationally wrong for fast preview workflows.
- Over-broad invalidation can waste image and TTS cost.
- Under-invalidation can publish stale localized or rendered content.
- Legacy `episode` command help omits `pt`; changing behavior without compatibility tests risks operator confusion.

## 37. Open Questions

1. Durable workflow store location: evidence shows filesystem artifacts are authoritative and SQLite is lightweight. Assumption: JSON manifest is source of truth and SQLite is mirror. If wrong, migration should promote SQLite after schema design.
2. Manual localized fallback: no current explicit manual localized artifact contract was found. Assumption: postpone manual fallback until a typed CLI flag and provenance contract exist.
3. Short production analysis: current implementation is full-only. Assumption: extend schema and persistence additively rather than overloading full analysis.
4. Scene extraction source for unified workflow: current media path can derive scenes from narration/subtitles. Assumption: language-neutral scenes should derive from accepted English full and timing can be adapted per locale render.

## 38. Acceptance Criteria

- One English full story drives all accepted downstream artifacts.
- Locales are exactly `en`, `de`, `fr`, `es`, `pt`.
- `sp` is rejected or normalized to `es` before identity and cannot create a second branch.
- English rewrite is attempted; provider failure triggers source fallback quality gate.
- Provider failures and quality failures are distinct persisted outcomes.
- Locale branches, fallback, full/short gates, audio, metadata, images, render, and publish are independently persisted.
- Shared images depend on accepted English visual prerequisites, not localization success.
- Batch usage is per-item retryable and optional.
- Workflow state is durable, resumable, idempotent, cost-observable, and status/inspect visible.
- Legacy commands remain compatible during migration.
