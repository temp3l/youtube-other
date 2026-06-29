# Task 06: Token Budgeting And Preflight Plan

## 1. Executive Summary

Task 06 adds deterministic preflight before every paid story narration request so predictable failures are blocked before provider calls, persisted as failed preflight records, and used to prevent repeated unchanged failed requests.

Canonical Task 06 source prompt: `todo-prompts/story-rewrite-refactor-codex-prompts/06-token-budgeting-and-preflight.md`.

The implementation should add one shared preflight module and wire it into existing sync full generation, localized full generation, short generation, short repair, full repair, and story batch preparation/retry. It must not start Task 07 canonical English full-generation work or Task 09/10 short-contract/compiler migration.

## 2. Exact Scope

Task 06 owns:

- Variant-specific preflight for:
  `canonical-english-full`, `localized-full`, `canonical-english-short`, `localized-short`, `full-repair`, `short-repair`, and future/model-backed `semantic-validation`.
- Deterministic estimates for input tokens, output-token cap, target word/duration range, schema availability, language/locale support, model/reasoning config, cost ceiling when pricing is available, duplicate failed request fingerprint, and parent full-story availability for shorts.
- Request fingerprinting that includes prompt fingerprint, schema fingerprint, model, reasoning, output cap, language, operation, source hash, and variant constraints.
- Persisted preflight outcomes for sync, short, and batch flows.
- Config and CLI plumbing only where needed to expose existing config precedence or a missing cost ceiling/retry cap.
- Tests proving provider clients are not called on preflight failure.

Prerequisites from Tasks 01-05 verified in repo:

- Task 02: `StoryIR` and artifact variant modeling exist in `packages/story-localization/src/story-artifact-model.ts`.
- Task 03: source cleaning/provenance exists in `source-cleaning.ts` and `source-cleaning-persistence.ts`.
- Task 04: genre policies and full-story contracts exist in `genre-policy.ts` and `full-story-contract.ts`.
- Task 05: modular compiler exists in `story-prompt-compiler.ts`; full batch localization uses compiled narration-only prompts; batch imports normalize legacy mixed outputs.

## 3. Non-Goals

- Do not implement Task 07 canonical English generation redesign.
- Do not remove French support in active CLI/tests; treat `fr` as compatibility-only because current code and docs expose it.
- Do not rename or reinterpret `docs/templates/audio/`.
- Do not change artifact paths, CLI command names, `.env` precedence, or provider routing except to add preflight checks.
- Do not migrate persisted artifacts in place.
- Do not redesign validation/repair semantics beyond bounded preflight admission and duplicate failed-request suppression.
- Do not issue paid API calls during implementation or tests.

## 4. Repository Findings

- `packages/story-localization/src/story-localization.service.ts`
  Current responsibility: sync full/localized generation, OpenAI request construction, repair loop, cache writes, resume checks.
  Proposed change: call preflight before each `generateStructuredStoryPackage()` initial call and before repair calls; persist failures and return episode failure without provider calls.
  Reason: full, localized, and full-repair stages need paid-call admission.
  Compatibility impact: existing CLI output paths unchanged; impossible requests now fail earlier with clearer diagnostics.
  Tests required: update `story-localization.unit.test.ts` and integration resume tests.
- `packages/story-localization/src/short-rewrite.service.ts`
  Current responsibility: short generation, short repair, sidecar/manifest persistence, resume checks.
  Proposed change: preflight before `requestStructuredShortRewrite()` initial and repair calls; include output cap in fingerprint; persist failed preflight artifact/manifest entry.
  Reason: Task 06 explicitly covers canonical/localized short and short repair.
  Compatibility impact: legacy sidecars without preflight remain readable.
  Tests required: update `short-rewrite.service.unit.test.ts`.
- `packages/story-localization/src/story-localization-batch-service.ts`
  Current responsibility: batch JSONL request construction, manifest persistence, import, retry.
  Proposed change: run preflight during `buildEnglishShortBatchItem()` and `buildLocalizationBatchItem()` before request item inclusion; failed items appear in manifest with no JSONL line; retry respects duplicate failed fingerprint.
  Reason: batch preparation must not enqueue known-impossible paid requests.
  Compatibility impact: manifest can contain preflight-failed planned items; JSONL item count may be lower than manifest item count unless implemented as skipped item status.
  Tests required: update `story-localization.batch.integration.test.ts`.
- `packages/story-localization/src/story-localization-cache.ts`
  Current responsibility: successful full/localized cache entries.
  Proposed change: keep success cache success-only; do not overload it for preflight failures.
  Reason: failed preflight records need separate semantics from reusable successful outputs.
  Compatibility impact: legacy cache entries remain readable.
  Tests required: cache/preflight ledger tests.
- `packages/story-localization/src/story-localization.schemas.ts`
  Current responsibility: story output schemas and batch manifest schemas.
  Proposed change: add optional `preflight` object to `localBatchManifestItemSchema`; add item status `preflight-failed` if needed.
  Reason: persist and count preflight failures in batch without provider calls.
  Compatibility impact: optional fields preserve legacy manifest reads.
  Tests required: schema roundtrip in batch integration tests.
- `packages/story-localization/src/story-localization.types.ts`
  Current responsibility: TypeScript types for config, cache, batch, results.
  Proposed change: add preflight types or re-export from new module; add optional preflight fields to batch item/result summaries; add failure count if needed.
  Reason: typed propagation to CLI/batch callers.
  Compatibility impact: additive.
  Tests required: typecheck and manifest tests.
- `packages/config/src/index.ts`
  Current responsibility: `.env`, process env, episode config, and override precedence.
  Proposed change: add only missing explicit settings if implementation needs them: `openAiStoryPreflightCostCeilingUsd`, `openAiShortPreflightCostCeilingUsd`, and aliases under `MEDIAFORGE_OPENAI_*`; otherwise rely on existing max-output/retry config.
  Reason: Task 06 requires cost-ceiling preflight.
  Compatibility impact: defaults undefined means no ceiling.
  Tests required: config precedence tests in `packages/config/src/index.unit.test.ts`.
- `apps/cli/src/story-full-rewrite-command.ts`, `apps/cli/src/story-short-rewrite-command.ts`, `apps/cli/src/story-localization-commands.ts`
  Current responsibility: command options and config mapping.
  Proposed change: pass any new cost ceiling/preflight policy options only if added; no command rename.
  Reason: preserve external interface while allowing opt-in ceilings.
  Compatibility impact: additive CLI flags only if required.
  Tests required: CLI option forwarding tests.
- `docs/cli.md`, `docs/multilingual-story-localization-settings.md`, `docs/architecture/story-localization.md`
  Current responsibility: user-facing workflow docs.
  Proposed change: document preflight failure behavior, duplicate failed-request suppression, and no-provider-call guarantee for deterministic failures.
  Reason: behavior changes documented architecture/commands.
  Compatibility impact: docs only.
  Tests required: path/doc grep checks.

## 5. Current End-To-End Flow

- `stories rewrite-full`:
  `apps/cli/src/story-full-rewrite-command.ts` -> `localizeStoryEpisode()` -> `prepareCleanedInputStory()` -> `parseCanonicalSourceStory()` -> `extractCanonicalStoryFacts()` -> production context -> `buildFullPromptConfig()` -> `buildLocalizationPrompt()` -> `generateStructuredStoryPackage()` -> `callOpenAiStructured()` -> parse/validate/repair -> render Markdown -> cache entry -> localized full loop.
- `stories rewrite-short`:
  `apps/cli/src/story-short-rewrite-command.ts` -> `rewriteShortStories()` -> `resolveShortRewriteInput()` -> `materializeCanonicalSourceStory()` -> `generateLanguagePayload()` -> `compileShortStoryPrompt()` -> `requestStructuredShortRewrite()` -> parse/analyze -> optional repair -> sidecar/manifest writes.
- `stories localize --mode batch`:
  `story-localization-commands.ts` -> `prepareStoryLocalizationBatch()` -> `buildBatchItems()` -> source materialization -> production context -> `englishShortBody()` or `compileFullStoryPrompt()`/`localizationBody()` -> JSONL/manifest -> optional submit/import/retry.
- Resume:
  Full sync uses `.localization-cache` keyed by source/config hash and output source marker.
  Short uses JSON sidecar + prompt fingerprint + manifest.
  Batch uses manifest item status, cache entries, deterministic custom IDs, and retry manifests.
- Diagnostics:
  Current logs summarize episode result; debug artifacts may persist prompts/requests/responses, but no structured preflight diagnostics exist.

## 6. Target Architecture

Add one shared preflight boundary in `@mediaforge/story-localization`:

- New module: `packages/story-localization/src/story-generation-preflight.ts`.
- New persistence: preflight records stored under episode cache/manifest-adjacent state, not successful generation cache.
- Preflight input is provider-neutral and built after prompt compilation/request construction but before any paid provider call or batch JSONL inclusion.
- Preflight output is a typed `pass | fail | warn` result with deterministic `requestFingerprint`.
- Failed preflight is persisted and counted without calling provider.
- Re-running the same failed request fingerprint blocks again unless semantic inputs/config change or `force`/explicit retry policy allows re-evaluation.

Completeness policy for Task 06:

- Preflight estimates minimum feasible output tokens from target word range and schema overhead.
- Runtime still detects `max_output_tokens` exhaustion from provider responses.
- Structural incomplete output remains validation-owned, but preflight prevents known impossible caps before calls.

## 7. Canonical Interfaces And Schemas

Add `story-generation-preflight.ts`:

- `StoryNarrationOperation = "generate" | "localize" | "validate" | "repair"`.
- `StoryNarrationVariant = "canonical-english-full" | "localized-full" | "canonical-english-short" | "localized-short" | "full-repair" | "short-repair" | "semantic-validation"`.
- `StoryPreflightInput`
  Fields: episode slug/number, language, locale, operation, variant, model, reasoning effort, max output tokens, retry cap, prompt version, prompt fingerprint, schema name/version/fingerprint, source hash, target word/duration range, estimated input tokens, estimated minimum output tokens, cost ceiling, parent artifact identity.
- `StoryPreflightResult`
  Fields: status, blocking diagnostics, warnings, request fingerprint, duplicate failure decision, estimated cost when pricing exists, checkedAt.
- `StoryPreflightFailureCode`
  Include: `INPUT_TOKEN_ESTIMATE_TOO_HIGH`, `OUTPUT_CAP_TOO_LOW`, `MISSING_SCHEMA`, `UNSUPPORTED_LANGUAGE`, `UNSUPPORTED_LOCALE`, `MISSING_MODEL_CONFIG`, `COST_CEILING_EXCEEDED`, `DUPLICATE_FAILED_REQUEST`, `MISSING_PARENT_FULL_STORY`, `INVALID_TARGET_RANGE`.

Persistence:

- Full sync preflight ledger: `<episode>/.localization-cache/preflight/<requestFingerprint>.json`.
- Short preflight ledger: `<episode>/manifests/short-rewrite-preflight.json` or `<episode>/.localization-cache/preflight/` if shared episode cache is already available.
- Batch manifests: add optional `preflight` object on `LocalBatchManifestItem`.
- Successful cache entries remain success-only.

## 8. File-By-File Change Plan

- `packages/story-localization/src/story-generation-preflight.ts`
  Current responsibility: does not exist.
  Proposed change: add schemas, token estimator, output feasibility checks, cost check, request fingerprint builder, duplicate failure lookup API.
  Reason: centralize deterministic checks across full/short/sync/batch.
  Compatibility impact: additive export only.
  Tests required: new `story-generation-preflight.unit.test.ts`.
- `packages/story-localization/src/story-localization.service.ts`
  Current responsibility: sync full/localized generation and repair.
  Proposed change: call preflight before each `generateStructuredStoryPackage()` initial call and before repair calls; persist failures and return episode failure without provider calls.
  Reason: full, localized, and full-repair stages need paid-call admission.
  Compatibility impact: existing CLI output paths unchanged; impossible requests now fail earlier with clearer diagnostics.
  Tests required: update `story-localization.unit.test.ts` and integration resume tests.
- `packages/story-localization/src/short-rewrite.service.ts`
  Current responsibility: short generation, repair, resume, sidecar/manifest.
  Proposed change: preflight before `requestStructuredShortRewrite()` initial and repair calls; include output cap in fingerprint; persist failed preflight artifact/manifest entry.
  Reason: Task 06 explicitly covers canonical/localized short and short repair.
  Compatibility impact: legacy sidecars without preflight remain readable.
  Tests required: update `short-rewrite.service.unit.test.ts`.
- `packages/story-localization/src/story-localization-batch-service.ts`
  Current responsibility: batch JSONL request construction, import normalization, manifest configuration hashes.
  Proposed change: run preflight before adding English short or localized full request lines; persist failed preflight manifest entries; retry only changed or explicitly eligible failed preflights.
  Reason: batch preparation is a paid-call staging boundary.
  Compatibility impact: batch storage layout unchanged; prepared JSONL can omit preflight-failed items.
  Tests required: `story-localization.batch.integration.test.ts`.
- `packages/story-localization/src/story-localization.schemas.ts`
  Current responsibility: manifest and payload runtime schemas.
  Proposed change: add optional preflight schema to manifest items and optional status support.
  Reason: persisted diagnostics must validate.
  Compatibility impact: legacy manifests remain readable.
  Tests required: schema and batch manifest tests.
- `packages/story-localization/src/story-localization.types.ts`
  Current responsibility: public TypeScript contracts.
  Proposed change: add or import preflight result types and optional manifest/result fields.
  Reason: typed service and CLI propagation.
  Compatibility impact: additive.
  Tests required: package typecheck.
- `packages/config/src/index.ts`
  Current responsibility: runtime config and env precedence.
  Proposed change: add cost-ceiling settings only if implementation cannot model them as service options.
  Reason: Task 06 requires cost-ceiling preflight while preserving precedence.
  Compatibility impact: optional unset defaults.
  Tests required: config unit tests if fields are added.
- `apps/cli/src/story-full-rewrite-command.ts`, `apps/cli/src/story-short-rewrite-command.ts`, `apps/cli/src/story-localization-commands.ts`
  Current responsibility: CLI options and service config mapping.
  Proposed change: no command rename; add/forward preflight config only if new user-facing settings are added.
  Reason: preserve external interfaces.
  Compatibility impact: additive only.
  Tests required: CLI unit tests only if flags are added.
- `docs/cli.md`, `docs/multilingual-story-localization-settings.md`, `docs/architecture/story-localization.md`
  Current responsibility: documented workflows and behavior.
  Proposed change: document preflight behavior after implementation.
  Reason: Task 06 changes documented runtime behavior.
  Compatibility impact: docs only.
  Tests required: targeted grep/path checks.

## 9. Compatibility And Migration Strategy

- Keep all existing commands usable.
- Read old full cache entries and short sidecars without preflight fields.
- New writes include preflight fingerprints where relevant.
- Do not overwrite valid prior artifacts on preflight failure.
- Batch preflight failures should be visible in manifests/reports and retryable only after config/prompt/source fingerprint changes or explicit force policy.
- Treat `fr` as compatibility-supported in code for Task 06 because active docs/tests/CLI expose it; do not expand new canonical language decisions around it.
- Legacy mixed full-story artifacts remain readable only through Task 05 adapters; Task 06 writes no mixed story payloads.

## 10. Error Handling And Repair Policy

- Preflight failures are blocking diagnostics, not provider errors.
- Provider `max_output_tokens` exhaustion remains runtime error handling, but repeated unchanged exhaustion should persist as failed request fingerprint.
- Repair preflight uses repair prompt/request fingerprint, not initial generation fingerprint.
- Repair gets only existing invalid result plus validation issues, preserving current minimum-context pattern.
- Repair attempts remain bounded by existing one-repair short path and existing full repair/second-repair logic; Task 06 only adds admission checks.
- If repair fails preflight or validation, preserve previous valid artifact and write failure diagnostics only.
- Empty/whitespace-only output, language mixing, metadata/audio fields, and structural incompleteness remain validation failures but feed duplicate-failure ledger when request fingerprint is unchanged.

## 11. Cost And Performance Safeguards

- Estimate input tokens with a deterministic local estimator, initially replacing scattered `Math.ceil(chars / 4)` with a named shared estimator.
- Estimate output requirement from target max words plus JSON/schema overhead.
- Include `max_output_tokens`, retry cap, model, reasoning effort, prompt fingerprint, schema fingerprint, source hash, language, and variant in request fingerprint.
- Check cost ceiling only when pricing is available; unknown pricing emits warning, not block, unless a ceiling explicitly requires pricing.
- Avoid regeneration when resume validates a completed language.
- Batch preparation skips/preflight-fails items before JSONL serialization.
- Keep concurrency unchanged but ensure duplicate-failed checks happen before worker/provider execution.
- Atomic writes use existing `writeJsonAtomic`, `writeTextAtomic`, and manifest locks.

## 12. Observability Requirements

Structured logs/diagnostics must include:

- episode slug/number and source hash;
- language and locale;
- operation: generate, localize, validate, repair;
- variant;
- model and reasoning effort;
- prompt version and prompt fingerprint;
- schema name/version/fingerprint;
- max output tokens and estimated input/output tokens;
- attempt number where applicable;
- preflight status and failure codes;
- duplicate-failure decision;
- resume/cache decision;
- artifact preservation/write decision;
- final success or terminal failure.

Do not log API keys, full prompts, or narration bodies by default.

## 13. Test Plan

Add or update tests:

- `packages/story-localization/src/story-generation-preflight.unit.test.ts`
  Cover token estimates, output cap failure, fingerprint changes when output cap changes, schema missing, unsupported language/locale, cost ceiling, duplicate failed request.
- `packages/story-localization/src/story-localization.unit.test.ts`
  Cover full preflight failure before provider call, localized full preflight failure, repair preflight failure, `max_output_tokens` fingerprinting.
- `packages/story-localization/src/short-rewrite.service.unit.test.ts`
  Cover short preflight failure before provider call, short repair preflight, resume after partial language completion, preservation of valid artifacts.
- `packages/story-localization/src/story-localization.batch.integration.test.ts`
  Cover batch preflight-failed manifest item, no JSONL line/provider submission for failed item, retry after changed fingerprint, legacy manifest compatibility.
- `packages/config/src/index.unit.test.ts`
  Cover `.env` < process env < episode config < overrides for any new cost ceiling fields.
- `apps/cli/src/story-full-rewrite-command.unit.test.ts`, `apps/cli/src/story-short-rewrite-command.unit.test.ts`, `apps/cli/src/story-localization-commands.unit.test.ts`
  Cover any added option forwarding and unchanged command surfaces.
- Existing validation coverage remains responsible for metadata/audio rejection, truncated output detection, incomplete localization detection, language mixing, unknown genre blocking, and legacy mixed normalization; add regression tests only where preflight consumes their diagnostics.

Run targeted validation:

- `pnpm test:unit -- packages/story-localization/src/story-generation-preflight.unit.test.ts`
- `pnpm test:unit -- packages/story-localization/src/story-localization.unit.test.ts packages/story-localization/src/short-rewrite.service.unit.test.ts`
- `pnpm exec vitest run -c vitest.unit.config.ts packages/story-localization/src/story-localization.batch.integration.test.ts`
- `pnpm test:unit -- packages/config/src/index.unit.test.ts apps/cli/src/story-full-rewrite-command.unit.test.ts apps/cli/src/story-short-rewrite-command.unit.test.ts`
- `pnpm --filter @mediaforge/story-localization typecheck`
- `pnpm --filter @mediaforge/cli typecheck`

## 14. Ordered Implementation Phases

1. Add preflight types, schemas, fingerprinting, token/cost estimators, and unit tests.
2. Add preflight persistence helpers and duplicate-failure ledger tests.
3. Wire sync full/localized generation and full repair preflight.
4. Wire short generation and short repair preflight.
5. Wire batch preparation/retry preflight and manifest schema additions.
6. Add config/CLI cost ceiling only if required by implementation.
7. Update docs for user-visible preflight behavior.
8. Run targeted tests and typechecks.

## 15. Acceptance Criteria

- Every paid narration stage has variant-specific preflight.
- Full stories and shorts have separate output caps and retry caps.
- Preflight failures are persisted and counted without provider calls.
- Output cap changes affect request fingerprint.
- Duplicate unchanged failed requests are blocked before provider calls.
- Existing commands, artifact paths, resume behavior, and batch import compatibility remain usable.
- Task 07+ work is not implemented.

## 16. Risks And Mitigations

- Risk: deterministic token estimates are approximate.
  Mitigation: use conservative thresholds and explicit estimator version in fingerprints.
- Risk: adding preflight status to manifests breaks legacy reads.
  Mitigation: optional fields and additive status handling with schema tests.
- Risk: English short batch remains legacy direct prompt.
  Mitigation: preflight wraps existing body without migrating prompt semantics; defer deeper short compiler migration.
- Risk: French language conflict with established decisions.
  Mitigation: keep `fr` compatibility for active surfaces; do not promote it as new canonical Task 06 scope.
- Risk: duplicate-failure ledger blocks a legitimate retry after external model fix.
  Mitigation: include model/config/prompt/schema/output cap in fingerprint and allow force-policy escape if existing force semantics require it.

## 17. Dependencies On Tasks 01-05

- Task 01 baseline call graphs and current defects guide hook placement.
- Task 02 `StoryIR` and artifact variants inform variant naming and parent checks.
- Task 03 source cleaning provides stable cleaned source hashes for fingerprints.
- Task 04 genre policy/full contract provides blocking diagnostics before prompt/provider stages.
- Task 05 compiler provides prompt/schema fingerprints for full and short prompts.

## 18. Explicit Deferrals To Task 07+

- Canonical English full-generation orchestration redesign.
- Full/short validation matrix expansion beyond preflight admission.
- Short adaptation contract and beat extraction.
- Short prompt compiler/generation migration for batch English short.
- Metadata/audio stage separation.
- Scene/image/render/publication separation.
- Broad cache/resume invalidation redesign beyond preflight fingerprints.
- Cleanup/removal of legacy mixed schema readers.

## 19. Open Questions Requiring Implementation-Time Confirmation

- Whether to store short preflight records under `manifests/` or shared `.localization-cache/preflight/`; prefer shared cache if path ownership is clean.
- Whether a new batch status `preflight-failed` is acceptable or whether to reuse `content-invalid` with structured preflight error details.
- Whether cost ceiling should be configurable now or represented as optional API input only until a concrete operator need exists.
- Whether full sync cache keys should immediately include prompt fingerprint to close the Task 05 gap visible in `story-localization.service.ts`, or whether Task 06 should only include it in preflight request fingerprints to avoid cache behavior migration.

## 20. Completion Notes For Planning

Identified Task 06 title: `Token Budgeting And Preflight`.

Source prompt path: `todo-prompts/story-rewrite-refactor-codex-prompts/06-token-budgeting-and-preflight.md`.

Plan file: `docs/plans/06-token-budgeting-and-preflight-plan.md`.

Main architectural decisions: one shared preflight module, persisted duplicate-failure ledger, variant-specific request fingerprints, additive manifest/cache metadata, no provider calls on deterministic preflight failure.

Compatibility boundaries: preserve CLI commands, artifact paths, `.env` precedence, `docs/templates/audio/` compatibility, legacy full batch reads, legacy short sidecar reads, and current `fr` compatibility.

Unresolved questions: preflight ledger physical path for short, batch failed status naming, optional cost-ceiling config shape, and whether to update full sync cache keys with prompt fingerprints in Task 06.

No production implementation should be performed by this task. Task 07 and later tasks should not be started.
