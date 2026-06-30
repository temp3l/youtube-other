# Story Localization

## Purpose

This subsystem handles structured English full rewrites, localized full rewrites, and localized or English short rewrites from canonical source stories. It is separate from the older episode-production commands, even though both flows can feed the same episode workspace structure.

## Entry Points

- `apps/cli/src/story-localization-commands.ts`
- `apps/cli/src/story-full-rewrite-command.ts`
- `apps/cli/src/story-short-rewrite-command.ts`

## Main Services

- `packages/story-localization/src/story-localization.service.ts`
- `packages/story-localization/src/short-rewrite.service.ts`
- Supporting modules handle source discovery, deterministic source cleaning, prompt building, canonical fact extraction, cache reads and writes, batch manifests, validation, and artifact rendering.
- `packages/story-localization/src/story-artifact-model.ts` adds an additive normalized `StoryIR`, `StoryArtifactVariant`, and `StoryOutputConstraints` model for future migration work. Baseline details live in `docs/plans/story-ir-and-artifact-variant-modeling.md`.
- `packages/story-localization/src/genre-policy.ts`, `full-story-contract.ts`, and `stable-json.ts` add additive Task 04 building blocks: centralized typed genre policies, deterministic policy compatibility checks, strict full-story contract construction, explicit contract lineage, and canonical hashing/serialization. These modules do not yet rewire prompt compilation or provider calls.
- `packages/story-localization/src/story-generation-preflight.ts` owns deterministic token-budget preflight for narration model requests before sync or batch provider submission.

## Ordered Stages

1. Source discovery and cleaning
   Canonical English sources are discovered, the exact original source is preserved, production-only source contamination is removed conservatively, and `source-cleaning-report.json` records hashes, removed segments, flagged segments, and cleaner versions.
   Short rewrites that derive from generated full-story markdown persist their cleaning sidecars separately as `cleaned-short-story.md`, `original-short-story.md`, and `short-story-cleaning-report.json` so they do not overwrite canonical source-cleaning artifacts.
2. Source parsing
   Cleaned canonical sources are parsed into structured story input. Metadata sections are no longer required for cleaned narration sources.
3. Canonical fact extraction
   Fact extraction builds a stable representation used by downstream rewrite and localization prompts.
4. StoryIR policy and contract modeling
   Typed genre policies and full-story contracts can now be derived deterministically from validated `StoryIR`, with effective generation boundaries resolved before later prompt-compilation work.
5. Prompt construction
   Prompt builders assemble narration-only structured requests for full rewrites, localized rewrites, and short rewrites. Typed module ownership checks reject metadata, audio/TTS, scene, image, render, thumbnail, and publication-owned prompt modules before any provider call.
6. Token-budget preflight
   The compiled request is checked locally against model context limits, model output limits, expected output requirements, schema overhead, and a safety reserve. Blocked requests do not call the provider.
7. OpenAI structured generation
   The services call the Responses API with schema-backed output formats and configurable model, reasoning, and token settings.
8. Validation and repair
   Generated output is checked for schema validity, message preservation, duration or word-count constraints, and filler or editorial drift; repair prompts can be issued when needed.
9. Cache writes and artifact materialization
   Cache entries, production artifacts, narration-only canonical JSON artifacts, compatibility markdown, JSON sidecars, and debug artifacts are persisted into episode output directories.

## Downstream Ownership Boundaries

- Validated narration is the upstream owner for downstream metadata and audio stages.
- Metadata is owned by `@mediaforge/metadata` and persists its own parent narration fingerprint, model/config fingerprint, prompt/schema fingerprint, status, and failure metadata.
- Audio instructions and TTS are owned by `@mediaforge/speech` and persist their own narration fingerprint, voice/config fingerprints, dependency fingerprint, and failure metadata.
- Metadata or audio failures do not invalidate narration and do not route through narration repair policy.
- Scene/image/render/publication remain separate downstream owners; Task 14 owns their boundary work.

## Compatibility Markdown

- Canonical English full persistence now writes narration-only canonical markdown under `en/full/script.md`.
- Legacy combined markdown remains supported through compatibility rendering at the episode root and existing localized compatibility files.
- Compatibility rendering can combine independently persisted narration, metadata, and audio artifacts, but those combined markdown files are not the canonical persistence source.

## Token-Budget Preflight

- Full generation, localization, short generation, targeted repair, and Task 06-owned batch request construction use one preflight module.
- Estimates are deterministic and offline. Known model families use the local OpenAI-compatible estimator; unknown models use a conservative fallback and emit diagnostics.
- Budgets track input estimate, expected output, requested `max_output_tokens`, model context window, model output limit, safety reserve, projected total, and remaining headroom separately.
- Blocked sync requests write preflight diagnostics under the episode `.localization-cache/preflight/` ledger and preserve existing valid artifacts.
- Blocked batch requests are recorded as `preflight-failed` manifest items and omitted from the JSONL input file, so they cannot be submitted unchanged.

## Resume and Idempotency

- Full localization checks cache state and existing outputs before regenerating.
- Short rewrites support overwrite versus resume semantics and use manifest updates plus file locks around persisted artifact state.
- Batch mode persists manifests and supports refresh, import, and retry of failed items instead of recomputing whole runs.
- Preflight fingerprints include model capability definitions, prompt/schema fingerprints, output caps, language, operation, source hash, and policy version; unchanged preflight failures are not retried unchanged.

## Debug Artifacts

- The services can persist prompt, request, response, and error artifacts for debugging.
- Those persisted payloads can be large. Do not load them by default during routine repo discovery; read them only for an active debugging task.

## Relevant Tests and Source References

- `packages/story-localization/src/story-localization.unit.test.ts`
- `packages/story-localization/src/story-localization.integration.test.ts`
- `packages/story-localization/src/story-localization.batch.integration.test.ts`
- `packages/story-localization/src/short-rewrite.service.unit.test.ts`
- `packages/story-localization/src/short-rewrite.unit.test.ts`
- `packages/story-localization/src/story-localization.service.ts`
- `packages/story-localization/src/short-rewrite.service.ts`
- `packages/story-localization/src/story-localization-cache.ts`
- `packages/story-localization/src/story-localization-batch-storage.ts`
