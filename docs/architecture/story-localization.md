# Story Localization

## Purpose

This subsystem handles structured English full rewrites, localized full rewrites, and localized or English short rewrites from canonical source stories. It is separate from the older episode-production commands, even though both flows can feed the same episode workspace structure.

## Entry Points

- `apps/cli/src/story-localization-commands.ts`
- `apps/cli/src/story-full-rewrite-command.ts`
- `apps/cli/src/story-short-rewrite-command.ts`
- `apps/cli/src/story-analysis-command.ts`

## Main Services

- `packages/story-localization/src/story-localization.service.ts`
- `packages/story-localization/src/short-rewrite.service.ts`
- Supporting modules handle source discovery, deterministic source cleaning, prompt building, canonical fact extraction, cache reads and writes, batch manifests, validation, and artifact rendering.
- `packages/story-localization/src/story-artifact-model.ts` adds an additive normalized `StoryIR`, `StoryArtifactVariant`, and `StoryOutputConstraints` model for future migration work. Baseline details live in `docs/plans/story-ir-and-artifact-variant-modeling.md`.
- `packages/story-localization/src/genre-policy.ts`, `full-story-contract.ts`, `character-rename.service.ts`, `narration-constraints.ts`, and `stable-json.ts` now own deterministic story constraints: genre policy resolution, full-story contract construction, persisted character pseudonymization, fast narration pacing defaults, duration-derived short word ranges, and canonical hashing/serialization.
- `packages/story-localization/src/story-generation-preflight.ts` owns deterministic token-budget preflight for narration model requests before sync or batch provider submission.

## Ordered Stages

1. Source discovery and cleaning
   Canonical English sources are discovered, the exact original source is preserved, production-only source contamination is removed conservatively, and `source-cleaning-report.json` records hashes, removed segments, flagged segments, and cleaner versions.
   Short rewrites that derive from generated full-story markdown persist their cleaning sidecars separately as `cleaned-short-story.md`, `original-short-story.md`, and `short-story-cleaning-report.json` so they do not overwrite canonical source-cleaning artifacts.
2. Source parsing
   Cleaned canonical sources are parsed into structured story input. Metadata sections are no longer required for cleaned narration sources.
3. Canonical fact extraction
   Fact extraction builds a stable representation used by downstream rewrite and localization prompts.
4. Deterministic character pseudonymization
   Human characters are mapped once per episode to fictionalized names through a deterministic scored candidate pool. The persisted rename map is attached to the canonical full artifact and reused unchanged by localized full rewrites, short rewrites, repair, and regeneration.
5. StoryIR policy and contract modeling
   Typed genre policies and full-story contracts are derived deterministically from validated `StoryIR`. The contract now carries the authoritative character rename map and narration constraints used downstream.
   `professional-story-contracts.ts` defines the runtime-validated immutable-facts, supernatural-mechanics, experiment, 12–16 beat, editorial-review, narration-metrics, Short-contract, repair-scope, stage-gate, and complete cache-identity contracts. Critical mechanics, beat, or deterministic narration issues prevent readiness.
6. Prompt construction
   Prompt builders pseudonymize model-facing source narration, facts, written messages, and StoryIR before any provider call. Typed module ownership checks reject metadata, audio/TTS, scene, image, render, thumbnail, and publication-owned prompt modules before any provider call.
7. Token-budget preflight
   The compiled request is checked locally against model context limits, model output limits, expected output requirements, schema overhead, and a safety reserve. Blocked requests do not call the provider.
8. OpenAI structured generation
   The services call the Responses API with schema-backed output formats and configurable model, reasoning, and token settings.
9. Validation and repair
   Generated output is checked for schema validity, authoritative-name reuse, original-name leakage, message preservation, duration or word-count constraints, and filler or editorial drift. Repair prompts reuse the same rename map and do not choose fresh pseudonyms.
   Professional narration validation rejects meta-writing, editorial commentary, unresolved alternatives, generic character/evidence/stake placeholders, abstract escalation, and explanation after the final reveal. `READY_WITH_MINOR_EDITS` is advisory and blocks downstream work unless a content profile explicitly opts in.
10. Cache writes and artifact materialization
   Cache entries, production artifacts, narration-only canonical JSON artifacts, compatibility markdown, JSON sidecars, and debug artifacts are persisted into episode output directories. Canonical lineage now includes the character-rename-map hash so dependent artifacts invalidate when the rename contract changes.

10. Production analysis
   `stories analyze` reads a persisted full story artifact, evaluates production readiness, writes `story-production-analysis.json` beside the target story, and exposes the current or stale state through inspect/status surfaces without regenerating story content.

## Downstream Ownership Boundaries

- Validated narration is the upstream owner for downstream metadata and audio stages.
- OpenAI speech generation is now split into a staged narration owner under `audio narration`. It consumes localized story markdown, writes target-specific artifacts under `locales/<locale>/<variant>/audio/narration/`, and publishes only compatibility audio outputs when rollout mode is `new`.
- Metadata is owned by `@mediaforge/metadata` and persists its own parent narration fingerprint, model/config fingerprint, prompt/schema fingerprint, status, and failure metadata.
- Audio instructions and TTS are owned by `@mediaforge/speech` and persist their own narration fingerprint, voice/config fingerprints, dependency fingerprint, and failure metadata.
- Metadata or audio failures do not invalidate narration and do not route through narration repair policy.
- Scene/image/render/publication remain separate downstream owners; Task 14 owns their boundary work.

## Localized Unicode Policy

- Localized narration, titles, descriptions, metadata, tags, and TTS input must preserve native Unicode characters. Content text is normalized only to Unicode NFC.
- ASCII cleanup is allowed only for slugs, filenames, IDs, and provider-safe asset names. Do not reuse slug helpers for human-readable localized content.
- Localization prompts explicitly require natural accents, diacritics, umlauts, ß, ñ, ç, inverted Spanish punctuation, and other language-specific characters.
- Unicode quality validation runs after generation/import and before Markdown materialization is consumed by TTS or video production. German has a hard gate for obvious ASCII transliteration or long German text with no umlauts/ß; Spanish, French, Portuguese, Italian, and future languages use softer warnings for suspicious long ASCII-only text.
- Add new language validators in `packages/story-localization/src/localized-content-text.ts` by defining native-character patterns, suspicious ASCII replacement terms, and a word threshold. Keep auto-correction limited to safe NFC normalization.

## Authored Scripts And Compatibility Markdown

- Authored full scripts resolve from `episodes/<episode-slug>/languages/script-<language>.md`.
- Authored Short scripts, when they differ from the full script, resolve from `episodes/<episode-slug>/languages/short/script-<language>.md`.
- The shared authored-script resolver rejects stale duplicate layouts such as root `script.md`, `en/full/script.md`, or `<language>/full/script.md` instead of selecting the first match.
- Combined markdown projections may still be readable for migration tooling, but they are not the canonical persistence source.
- Compatibility rendering can combine independently persisted narration, metadata, and audio artifacts, but those combined markdown files are not the canonical persistence source.
- For already-generated episodes, migrate audio by keeping the existing story markdown unchanged, running `audio narration prepare`, `plan`, `generate`, `assemble`, and `validate` first in `shadow` for the target locale and variant, inspecting `quality-gate.json`, then rerunning the same stages in `new` with `--resume` to promote `mastered-narration.wav` to `audio/narration.wav`. Existing compatibility markdown remains valid and does not need regeneration unless the story text changes.

## Staged Narration Observability

- Narration telemetry events include `episodeId`, `language`, `variant`, `chunkId`, `stage`, `model`, `voice`, `attempt`, `latencyMs`, `inputCharacters`, `outputBytes`, optional `generatedSeconds`, `cacheDecision`, `validationResult`, `retryClass`, `failureClass`, `regeneration`, `fallbackUsed`, and a cost estimate when telemetry pricing is configured.
- Detail fields redact secret-like keys, raw audio keys, story text, full text, and chunk text. Batch status also redacts API keys, bearer tokens, credentials, and text-bearing error fragments.
- Cost controls are cache-first: `--resume` reuses completed staged artifacts, chunk cache hits avoid provider calls, `--dry-run` writes nothing, `--validation-only` avoids generation and assembly, `--concurrency <n>` bounds local chunk synthesis, and voice benchmarking is capped with `--max-samples`.
- Operator reports live beside the staged target: `quality-gate.json`, `quality-gate.md`, `generation-metadata.json`, chunk validation reports under `chunks/`, and cache records under the narration root. Voice benchmark reports live in `voice-benchmark.json`.

## Narration Pace

- Story rewrites default to the project `fast` narration pace while retaining a typed `normal` preset for future reuse.
- Fast defaults are language-specific and currently set to `en 190/205`, `de 180/195`, `es 190/205`, `fr 185/198`, and `pt 190/205` words per minute for `full/short`.
- Short word ranges are no longer hardcoded independently. They are derived from the active short duration window and target WPM in one typed utility, and the resulting constraints are shared by prompt compilation and validation.
- Full-story defaults derive from the shared 330-660 second editorial window, targeting roughly 10 minutes at the language profile pace. Application code, never model diagnostics, owns narration word counts and duration estimates.

## Full Localization Fidelity

- Canonical full narration is projected into ordered `beat-NNN` semantic beats plus a validated story-mechanics contract before localization. Beat IDs remain structured evidence and are never rendered into narration.
- Localized structured output must declare preserved beat IDs, mechanics, emotional cost, climax/rule connection, final consequence, and localized metadata. Acceptance uses language-specific spoken-duration ratios, semantic beat coverage, named-character presence, English leakage, and metadata checks.
- The default localization profile requires complete canonical beat coverage and a spoken-duration ratio of 85–115 percent.
- A severe duration loss, including a roughly 30 percent adaptation, forces full-stage regeneration. Missing mechanics or final consequences cannot pass as ready.
- Localization cache entries use cache schema v3 and fidelity policy v2. Older localized entries without fidelity validation metadata are unverified and cannot resume.

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
