# Codex Task: Implement a Two-Phase, Cacheable Batch Story + Image Pipeline for MediaForge

You are working in an existing TypeScript production application named **MediaForge**.

Your task is to inspect the repository and implement a production-grade pipeline for:

- canonical English full-story rewrites,
- canonical English Shorts,
- localized full stories,
- localized Shorts,
- reference-image generation,
- anchor / character / threat / object / environment image generation,
- production scene image generation that reuses reference images,
- image edits / repairs when needed,
- OpenAI Batch API orchestration,
- OpenAI prompt caching,
- local content-addressed caching,
- resumable and retryable batch workflows,
- strict validation,
- deterministic metadata,
- debug logging and cache observability.

Do **not** build a disconnected parallel system if suitable abstractions already exist. Reuse and strengthen the existing provider, CLI, batch, cache, prompt, story, image, validation, metadata and logging infrastructure wherever practical.

Do **not** stop after planning. Inspect the repository, write a staged implementation plan, implement it, add tests, run the relevant verification commands and report the actual results.

Do **not** submit paid production batches during implementation or tests unless the repository already contains a safe integration-test path and credentials are intentionally configured. Prefer simulation mode, deterministic fixtures, provider fakes and generated JSONL inspection.

---

## 1. High-level objective

Implement a **dependency-aware two-phase batching system** with high cacheability.

### Phase A — Canonical text and image reference preparation

First generate and validate the assets that downstream generations depend on:

1. Canonical English full story.
2. Canonical English Short.
3. Localized full stories.
4. Localized Shorts.
5. Image reference assets / anchor assets, including as applicable:
   - character reference images,
   - threat/entity reference images,
   - recurring object references,
   - recurring location / environment references,
   - optional style / look-dev references,
   - thumbnail-character anchor references where required.

### Phase B — Production image batches

Only after Phase A assets are valid:

1. Upload or register reference images for provider reuse.
2. Group scene-image requests by identical reusable prompt prefix and identical ordered reference bundle.
3. Submit the real production image-generation batches.
4. Ingest, validate, repair and resume failed image items independently.

### Required dependency rule

**No scene image that depends on reference images may be submitted until those reference images exist and have passed validation.**

This is required for:

- visual consistency,
- lower failure rates,
- lower repair cost,
- proper provider prompt-cache reuse,
- correct dependency-aware retry / resume behavior.

---

## 2. Required model configuration

Implement and document this recommended text-model configuration:

```env
# Canonical English full-story rewrite
MEDIAFORGE_OPENAI_STORY_MODEL=gpt-5.6-sol
MEDIAFORGE_OPENAI_STORY_REASONING_EFFORT=medium
MEDIAFORGE_OPENAI_STORY_MAX_OUTPUT_TOKENS=14000

# Full-story localization
MEDIAFORGE_OPENAI_LOCALIZATION_MODEL=gpt-5.6-terra
MEDIAFORGE_OPENAI_LOCALIZATION_REASONING_EFFORT=low
MEDIAFORGE_OPENAI_LOCALIZATION_MAX_OUTPUT_TOKENS=10000

# Canonical and localized Shorts
MEDIAFORGE_OPENAI_SHORT_MODEL=gpt-5.6-terra
MEDIAFORGE_OPENAI_SHORT_REASONING_EFFORT=low
MEDIAFORGE_OPENAI_SHORT_MAX_OUTPUT_TOKENS=4000

# Semantic story validator
MEDIAFORGE_OPENAI_VALIDATOR_MODEL=gpt-5.4-mini
MEDIAFORGE_OPENAI_VALIDATOR_REASONING_EFFORT=low
MEDIAFORGE_OPENAI_VALIDATOR_MAX_OUTPUT_TOKENS=5000

# Creative metadata only
MEDIAFORGE_OPENAI_METADATA_MODEL=gpt-5.4-mini
MEDIAFORGE_OPENAI_METADATA_REASONING_EFFORT=none
MEDIAFORGE_OPENAI_METADATA_MAX_OUTPUT_TOKENS=1800
```

Implement and document a configurable image-generation model selection layer. Use the repository’s supported image endpoint and preferred latest model abstraction, but support a configuration shape conceptually similar to:

```env
# Canonical reference / anchor image generation
MEDIAFORGE_OPENAI_IMAGE_REFERENCE_MODEL=gpt-image-2
MEDIAFORGE_OPENAI_IMAGE_REFERENCE_QUALITY=high
MEDIAFORGE_OPENAI_IMAGE_REFERENCE_SIZE=1536x1024

# Production scene image generation
MEDIAFORGE_OPENAI_IMAGE_SCENE_MODEL=gpt-image-2
MEDIAFORGE_OPENAI_IMAGE_SCENE_QUALITY=high
MEDIAFORGE_OPENAI_IMAGE_SCENE_SIZE=1920x1080

# Short vertical image generation
MEDIAFORGE_OPENAI_IMAGE_SHORT_MODEL=gpt-image-2
MEDIAFORGE_OPENAI_IMAGE_SHORT_QUALITY=high
MEDIAFORGE_OPENAI_IMAGE_SHORT_SIZE=1024x1536

# Image validation / repair planning if model-based validation is needed
MEDIAFORGE_OPENAI_IMAGE_VALIDATOR_MODEL=gpt-5.4-mini
MEDIAFORGE_OPENAI_IMAGE_VALIDATOR_REASONING_EFFORT=low
```

Requirements:

- Add strict runtime configuration validation.
- Use narrow types where practical.
- Validate supported reasoning levels per model.
- Do not silently downgrade to a different model.
- Return a clear configuration error when unsupported combinations are selected.
- Preserve explicit environment overrides.
- Update `.env.example`, configuration docs and tests.
- Treat `max_output_tokens` as a ceiling, not a target.
- Detect incomplete or truncated text responses and reject them.
- For image generation, reject malformed or incomplete provider responses and do not persist them as valid assets.

Use the Responses API for new GPT-5.6 text paths unless an existing abstraction has a documented reason to remain elsewhere.

---

## 3. Inspect the current implementation first

Trace and document the existing execution path for:

1. source-story ingestion,
2. source analysis,
3. story-bible creation,
4. protected-element extraction,
5. retention planning,
6. canonical English full rewrite,
7. canonical English Short generation,
8. full localization,
9. Short localization,
10. story validation,
11. repair calls,
12. metadata generation,
13. image planning,
14. image prompt construction,
15. image generation,
16. image edits / retries,
17. provider request construction,
18. existing local cache reads and writes,
19. existing prompt-cache behavior if any,
20. existing batch functionality,
21. resume and retry behavior,
22. episode production-state updates,
23. debug request / response logging,
24. simulation mode,
25. CLI orchestration.

Inspect known regression examples where available, especially recent episodes with failures like:

- generic filler in text,
- repeated localization boilerplate,
- inconsistent metadata,
- wrong language in audio instructions,
- image inconsistency across scenes,
- unnecessary scene regeneration,
- failed image requests halting the whole pipeline.

Identify the **first stage** where corruption or inefficiency is introduced.

---

## 4. Preserve canonical source-of-truth rules

Enforce this source-of-truth hierarchy:

```text
canonical English full narration
    └── localized full narrations

canonical English full narration + retention plan
    └── canonical English Short
            └── localized Shorts

validated reference / anchor images
    └── validated scene image requests that depend on them
            └── repairs / alternates / thumbnails
```

Required rules:

- A localized full story must derive from the accepted canonical English full narration.
- A localized Short must derive from the accepted canonical English Short.
- A scene image with character or object continuity requirements must derive from validated reference images.
- A repair must operate on the current artifact plus structured findings, not regenerate blindly unless required.
- Never overwrite the last known valid artifact with an invalid attempt.
- A failed localization or image generation must not corrupt its source-of-truth ancestor.

---

## 5. Implement static-prefix and dynamic-suffix prompt architecture

Refactor text and image prompts so they maximize cacheability.

### 5.1 Static prefix for text prompts

Place all stable reusable content first:

- role and task contract,
- story or localization rules,
- style rules,
- prohibited scaffolding rules,
- narration tense policy,
- schema rules,
- static output constraints,
- stable language-specific instructions,
- stable examples only if justified.

Do **not** include before the cache breakpoint:

- episode number,
- title,
- character names,
- canonical story text,
- protected elements,
- validation findings,
- timestamps,
- request IDs,
- batch IDs,
- random values,
- file paths.

### 5.2 Static prefix for image prompts

Place all stable reusable content first:

- project-wide visual rules,
- static visual bible for the channel / format,
- static quality rules,
- static framing or aspect-ratio instructions,
- no-text / limited-text rules when applicable,
- stable instructions describing how to use references,
- reusable style and rendering guidance.

Then place the stable **reference bundle** before the cache breakpoint:

- ordered input reference image list,
- stable reference roles,
- stable input fidelity or detail settings,
- stable instructions for preserving identity and continuity.

### 5.3 Dynamic suffix

Put variable content after the reusable prefix / reference bundle:

- episode-specific canonical text,
- scene-specific prompt,
- shot number,
- action,
- lighting,
- camera angle,
- repair findings,
- per-image modifications.

### 5.4 Canonicalization

Ensure semantically identical prompts serialize identically:

- normalize line endings,
- stable section ordering,
- deterministic JSON serialization,
- sorted object keys where safe,
- sorted protected elements by stable ID,
- stable reference ordering,
- no volatile whitespace,
- no timestamps in prompt content,
- no random IDs in prompt content.

Add snapshot tests proving:

- two items in the same prompt family share identical static prefixes,
- two scene-image requests sharing the same ordered references share the same prefix,
- dynamic content appears only after the cache breakpoint.

---

## 6. Implement OpenAI prompt-caching support

Create a typed prompt-cache abstraction for provider requests.

Conceptually:

```ts
type PromptCacheMode = 'disabled' | 'implicit' | 'explicit';

interface PromptCachePlan {
  readonly mode: PromptCacheMode;
  readonly cacheKey?: string;
  readonly ttl?: '30m';
  readonly breakpointAfterBlock?: string;
  readonly estimatedReusablePrefixTokens: number;
  readonly expectedReuseCount: number;
  readonly shard: number;
}
```

### 6.1 Eligibility

Only enable explicit cache writes when:

- the model supports it,
- the reusable prefix is estimated at >= 1024 prompt tokens,
- enough requests share the prefix,
- the request is not a one-off repair unless configured otherwise,
- the expected cache benefit justifies the write,
- the prefix does not include unstable per-episode content.

### 6.2 Cache keys

Generate stable privacy-preserving cache keys for both text and image operations.

Examples:

```text
mediaforge:story-localize:v3:full:de:terra:shard-0
mediaforge:story-short:v2:es:terra:shard-1
mediaforge:image-scene:v5:full:en:16x9:charA-entityB:shard-0
mediaforge:image-scene:v5:short:de:9x16:charA:shard-2
mediaforge:image-reference:v2:entity:full:en:shard-0
```

A cache key may include:

- namespace,
- prompt family,
- prompt version,
- operation,
- format,
- target language,
- model tier,
- aspect bucket,
- stable reference-bundle class,
- shard number.

It must not include:

- story title,
- raw story text,
- character names if sensitive,
- user email,
- file paths,
- personally identifying data.

### 6.3 Sharding

Implement stable configurable cache-key sharding.

Requirements:

- configurable shard count,
- `auto` mode,
- deterministic item-to-shard mapping,
- identical prefixes within a shard,
- avoid too many shards,
- log key and shard without exposing private content.

### 6.4 Explicit breakpoints

For supported GPT-5.6 text requests and supported image request structures:

- use `prompt_cache_key`,
- place explicit cache breakpoints after the final stable prefix block,
- for image scene requests, place the breakpoint after the final stable reference image block and stable reference-role instructions,
- isolate provider-specific fields inside the OpenAI adapter.

### 6.5 Metrics

Capture and persist:

- input tokens,
- cached input tokens,
- cache-write tokens,
- output tokens,
- reasoning tokens,
- cache-read ratio,
- cache-write ratio,
- estimated uncached cost,
- estimated actual cost,
- estimated savings,
- prompt family,
- prompt version,
- cache key,
- shard,
- model,
- stage,
- episode,
- language,
- format,
- image-operation subtype if applicable.

Provide an aggregate report by:

- model,
- prompt family,
- language,
- format,
- image subtype,
- batch,
- cache key,
- date range.

---

## 7. Implement local content-addressed result caching

Prompt caching reduces repeated input processing. It does **not** replace a local result cache.

Implement application-level caching for both text and image outputs so unchanged work is skipped entirely.

### 7.1 Story generation identity

Conceptually:

```ts
interface StoryGenerationIdentity {
  readonly operation:
    | 'canonical-full-rewrite'
    | 'canonical-short'
    | 'full-localization'
    | 'short-localization'
    | 'story-validation'
    | 'targeted-repair'
    | 'creative-metadata';

  readonly sourceHash: string;
  readonly protectedElementsHash?: string;
  readonly storyBibleHash?: string;
  readonly retentionPlanHash?: string;

  readonly sourceLanguage: string;
  readonly targetLanguage: string;
  readonly format: 'full' | 'short';

  readonly model: string;
  readonly reasoningEffort: string;
  readonly maxOutputTokens: number;

  readonly promptVersion: string;
  readonly schemaVersion: string;
  readonly validatorVersion: string;
}
```

### 7.2 Image generation identity

Conceptually:

```ts
interface ImageGenerationIdentity {
  readonly operation:
    | 'reference-image'
    | 'scene-image'
    | 'short-scene-image'
    | 'thumbnail-image'
    | 'image-edit'
    | 'image-variation'
    | 'image-repair';

  readonly episodeNumber?: string;
  readonly language?: string;
  readonly format: 'full' | 'short' | 'thumbnail' | 'reference';

  readonly promptVersion: string;
  readonly visualBibleVersion: string;
  readonly schemaVersion: string;
  readonly validatorVersion: string;

  readonly model: string;
  readonly quality: string;
  readonly size: string;
  readonly aspectRatio?: string;
  readonly background?: string;
  readonly moderationMode?: string;

  readonly stablePromptHash: string;
  readonly dynamicPromptHash: string;

  readonly orderedReferenceHashes: readonly string[];
  readonly orderedReferenceRoles: readonly string[];
  readonly referenceDetailMode?: string;
  readonly inputFidelity?: string;

  readonly sourceScenePlanHash?: string;
  readonly sourceStoryHash?: string;
  readonly sourceImageHash?: string;
}
```

### 7.3 Requirements

- Reuse a cached result only when all identity fields match.
- Validate cached artifacts before reuse.
- Detect corrupted cache files.
- Support revalidation without regeneration.
- Invalidate incompatible outputs after prompt / schema / validator changes.
- Use atomic writes.
- Distinguish cache hit, stale entry, invalid entry, forced regeneration.
- Support `--force` and `--revalidate`.
- Log local-cache hits separately from prompt-cache hits.

---

## 8. Implement two-phase image batching with dependency-aware tooling

This is the most important image-specific requirement.

### 8.1 Phase A — reference / anchor batch

Build tooling that generates the dependency assets first.

Reference / anchor asset classes may include:

- protagonist reference sheet,
- secondary-character reference,
- threat / entity reference,
- recurring object reference,
- recurring location reference,
- optional style exploration anchor,
- thumbnail anchor if required.

The planner must:

1. read scene plans and identify all required recurring visual entities,
2. derive dependency groups,
3. collapse duplicate reference requests,
4. check local cache first,
5. batch only missing reference assets,
6. ingest each result independently,
7. validate each reference image,
8. upload or register validated reference images for downstream reuse,
9. persist a mapping from logical reference asset -> generated image path -> content hash -> provider file ID if applicable,
10. stop downstream dependent scene batches until required references are valid.

### 8.2 Reference upload / registration

Implement reusable tooling to prepare validated generated images for downstream reference use.

Conceptually:

```ts
interface ProviderReferenceAsset {
  readonly logicalId: string;
  readonly localPath: string;
  readonly contentHash: string;
  readonly mimeType: string;
  readonly width: number;
  readonly height: number;
  readonly providerFileId?: string;
  readonly uploadedAt?: string;
  readonly provider?: 'openai';
}
```

Requirements:

- Upload identical reference images only once per provider / content hash where reuse is safe.
- Reuse stored provider file IDs for downstream requests.
- Re-upload when a provider file expires or becomes invalid.
- Keep provider upload state outside prompt content.
- Never repeatedly base64-embed the same local reference image if a reusable provider file ID can be used.
- Track upload failures independently.

### 8.3 Phase B — production scene-image batches

After reference assets are validated and reusable:

1. build scene-image requests,
2. compute their reference-bundle identity,
3. check local result cache,
4. group remaining requests by compatible model and operation,
5. within that, group by identical ordered reference bundle and static prompt family,
6. assign prompt-cache keys and shards,
7. batch submit the requests,
8. ingest each result independently,
9. validate size, format, continuity and content,
10. retry only failed items.

### 8.4 Required grouping strategy

Group scene requests primarily by:

```text
model
operation
format
size / aspect bucket
prompt family + version
reference-bundle hash
cache shard
```

Example concept:

```text
Group A: Clara reference only
  scene-01
  scene-02
  scene-05

Group B: Clara + David references
  scene-03
  scene-04
  scene-08

Group C: entity + environment references
  scene-06
  scene-07

Group D: no-reference inserts
  insert-01
  environment-02
```

Do **not** merely send “all reference-image prompts first” and then random scenes. Instead:

- first generate **reference assets**,
- then group downstream scene requests by **identical reusable reference bundle**,
- then process all items within each group together.

### 8.5 Batch ordering and dependency rule

Implement a planner that understands a dependency DAG.

Conceptually:

```ts
interface BatchDependencyNode {
  readonly id: string;
  readonly kind:
    | 'story'
    | 'short-story'
    | 'localization'
    | 'reference-image'
    | 'scene-image'
    | 'thumbnail-image'
    | 'repair';
  readonly dependsOn: readonly string[];
}
```

Rules:

- Scene image nodes must depend on required reference-image nodes.
- Thumbnail nodes may depend on reference-image or scene-image nodes depending on design.
- Reference-image nodes may depend on canonical story acceptance or scene-plan readiness.
- Resume logic must respect dependency completion.
- A failed reference-image node blocks its dependent scene-image nodes, but does **not** block unrelated episodes or languages.

---

## 9. Batch API orchestration for text and images

Implement resilient Batch API workflows for:

- canonical text rewrites,
- localizations,
- reference-image generation,
- production scene-image generation,
- image edits if supported by the repository’s provider abstraction.

### 9.1 Batch planner

The planner must accept:

- episode selectors,
- languages,
- format full / short / both,
- operation type,
- model config,
- prompt version,
- force / revalidate flags,
- max batch size,
- file-size limits,
- grouping strategy,
- dry-run / submit mode,
- dependency resolution mode.

The planner must:

1. resolve prerequisites,
2. validate readiness,
3. skip local-cache hits,
4. compute generation identities,
5. compute dependency graph,
6. split work into Phase A and Phase B,
7. group remaining requests by cache-compatible keys,
8. assign deterministic custom IDs,
9. estimate token and image volume,
10. write valid JSONL,
11. persist a manifest before submission.

### 9.2 Deterministic custom IDs

Examples:

```text
rewrite-full:033:en:attempt-1:<hash>
loc-full:034:de:attempt-1:<hash>
img-ref:034:char-clara:attempt-1:<hash>
img-scene:034:de:full:scene-03:attempt-1:<hash>
img-thumb:034:en:attempt-1:<hash>
```

The manifest must map each ID to:

- episode root,
- episode number,
- operation,
- target artifact,
- language,
- format,
- request hash,
- cache identity,
- prompt version,
- model,
- attempt,
- expected schema,
- dependencies.

### 9.3 Batch lifecycle

Support operations like:

- prepare,
- inspect,
- submit,
- list,
- status,
- poll,
- download,
- ingest,
- validate,
- repair-failed-items,
- resume,
- cancel when supported,
- create retry batch.

Track both **batch-level** and **item-level** status.

### 9.4 Per-item resilience

Track item states conceptually like:

```ts
type BatchItemStatus =
  | 'PENDING'
  | 'LOCAL_CACHE_HIT'
  | 'SUBMITTED'
  | 'SUCCEEDED'
  | 'PROVIDER_FAILED'
  | 'INCOMPLETE'
  | 'PARSE_FAILED'
  | 'VALIDATION_FAILED'
  | 'REPAIR_REQUIRED'
  | 'BLOCKED'
  | 'WRITTEN';
```

One failed item must not stop unrelated successes.

### 9.5 Expiration and partial results

When a batch partially fails or expires:

- download all successful results,
- ingest successful items,
- preserve valid artifacts,
- record failed or expired items,
- generate a retry manifest containing only unresolved items,
- do not resubmit local-cache hits,
- do not regenerate successful languages or images.

### 9.6 Idempotency

Every operation must be safe to repeat.

Use file locks, atomic renames or the repo’s concurrency mechanism.

---

## 10. CLI tooling requirements

Inspect current command conventions before final naming.

The resulting UX should support workflows equivalent to:

```bash
# Phase A: prepare and run reference-image batches first
mediaforge images batch-references prepare --episodes 030,033,034 --languages en,de,es,fr,pt
mediaforge images batch-references inspect <manifest>
mediaforge images batch-references submit <manifest>
mediaforge images batch status <batch>
mediaforge images batch download <batch>
mediaforge images batch ingest <batch>

# Phase B: after references are valid, prepare grouped production scene batches
mediaforge images batch-scenes prepare --episodes 030,033,034 --languages en,de,es,fr,pt --format both
mediaforge images batch-scenes inspect <manifest>
mediaforge images batch-scenes submit <manifest>
mediaforge images batch download <batch>
mediaforge images batch ingest <batch>
mediaforge images batch validate <batch>

# Stories
mediaforge stories batch-localize prepare --episodes 030,033,034 --languages de,es,fr,pt --format both
mediaforge stories batch-localize inspect <manifest>
mediaforge stories batch-localize submit <manifest>

# Retry only failed items
mediaforge images batch retry <batch>
mediaforge stories batch retry <batch>

# Resume unfinished work
mediaforge batches resume

# Revalidate without regenerating
mediaforge images batch-scenes prepare --episodes 034 --languages de --format full --revalidate

# Force regeneration
mediaforge images batch-scenes prepare --episodes 034 --languages de --format full --force
```

These command names are examples of behavior, not mandatory names.

Every command should support:

- human-readable output,
- optional JSON output,
- clear exit codes,
- per-item failure summaries,
- persisted machine-readable reports,
- the exact next resume or retry command.

---

## 11. Strict structured outputs

Use strict schemas for model-generated text artifacts.

Do not ask the model to generate deterministic metadata fields.

Reject:

- extra sections,
- prompt commentary,
- optimization notes inside narration,
- wrong-language narration,
- incomplete responses,
- truncated JSON,
- empty content,
- story scaffolding.

For image artifacts, persist a structured sidecar record including:

```ts
interface GeneratedImageRecord {
  readonly logicalId: string;
  readonly operation:
    | 'reference-image'
    | 'scene-image'
    | 'thumbnail-image'
    | 'image-edit'
    | 'image-repair';
  readonly localPath: string;
  readonly contentHash: string;
  readonly width: number;
  readonly height: number;
  readonly mimeType: string;
  readonly model: string;
  readonly quality: string;
  readonly size: string;
  readonly promptVersion: string;
  readonly visualBibleVersion: string;
  readonly sourceImageHashes: readonly string[];
  readonly referenceImageHashes: readonly string[];
  readonly validationStatus: StoryQualityStatus | 'VALID' | 'INVALID';
}
```

---

## 12. Fix known story-quality defects

Implement quality gates that prevent the previously observed failures:

### 12.1 Scaffolding leakage

Reject narration that contains production or outline commentary.

### 12.2 Generic filler

Reject unresolved alternatives and abstract placeholders.

### 12.3 Repetition

Detect exact, normalized and near-duplicate paragraphs.

### 12.4 Localization fidelity

Validate preservation of:

- character names,
- relationships,
- central object / location,
- supernatural rule,
- emotional cost,
- critical evidence,
- event order,
- climax mechanics,
- final reveal.

### 12.5 Compression

Reject extreme silent compression of localized full stories.

### 12.6 Shorts

Ensure Shorts preserve the strongest beats and meet actual duration limits.

### 12.7 Tense and language

Validate tense consistency, target language, diacritics and correct narration instructions.

---

## 13. Add image-specific validation

Implement layered image validation before an image is accepted into the pipeline.

### 13.1 Deterministic checks

Validate:

- file existence,
- MIME type,
- corruption / decodability,
- dimensions,
- aspect ratio,
- size bucket,
- whether transparency / background setting matches expectations,
- whether the file is non-empty,
- whether output format is correct.

### 13.2 Pipeline checks

Validate:

- reference images exist before dependent scene generation,
- scene-image requests use the correct ordered reference bundle,
- correct language / format bucket is used,
- duplicated requests are collapsed,
- duplicate outputs are not written twice.

### 13.3 Content / continuity checks

Where model-based validation is already supported or justified, validate:

- presence of the intended character / entity / object,
- identity continuity relative to reference images,
- scene compliance with prompt,
- basic composition correctness,
- obvious missing subject or catastrophic failures,
- whether a repair should be attempted,
- whether the image is acceptable as-is.

Return structured findings.

---

## 14. Implement targeted image repair strategy

Do not regenerate every failed scene from scratch when a repair is sufficient.

Repairs must receive:

- current image artifact,
- structured validation findings,
- relevant reference images,
- exact requested changes,
- instructions to preserve unaffected content.

Behavior:

- mechanical issue only: deterministic fix if possible,
- continuity or prompt mismatch: targeted image repair,
- severe wrong composition or wrong subject: full regeneration,
- repeated failures: mark blocked and continue unrelated work.

Repairs must have their own prompt family and cache identity.

Because repair prompts are highly variable, do not force prompt caching when reuse is unlikely.

---

## 15. Deterministic metadata generation

Calculate in code where possible:

- word count,
- speech duration,
- pause allowance,
- total duration,
- language code,
- episode number,
- format,
- resolution,
- aspect ratio,
- generation model,
- prompt version,
- validation status,
- image dimensions,
- image-operation type.

Use the metadata model only for creative fields like SEO description, tags and thumbnail text.

Render static audio-generation instructions from typed configuration rather than asking the model.

---

## 16. Observability and debug logging

Log all story and image provider operations with:

- stage,
- episode,
- language,
- format,
- model,
- reasoning effort if applicable,
- maximum output tokens if applicable,
- prompt family,
- prompt version,
- schema version,
- request hash,
- source hash,
- local-cache state,
- prompt-cache key,
- prompt-cache mode,
- prompt-cache shard,
- input tokens,
- cached tokens,
- cache-write tokens,
- output tokens,
- reasoning tokens,
- provider request ID,
- batch ID,
- custom ID,
- attempt,
- completion status,
- validation status,
- error code.

Continue logging full story-related and image-related request/response metadata in the episode debug directory.

Do **not** log:

- API keys,
- authorization headers,
- base64 image payloads,
- unrelated secrets.

Simulation mode must render:

- final request bodies,
- JSONL batch files,
- cache breakpoints,
- cache keys,
- grouping and sharding,
- estimated token and image volume,
- reference dependencies,
- local-cache hits,
- prompt-cache plans,
- provider upload / reuse plans.

---

## 17. Batch manifest and filesystem design

Follow repo conventions where possible.

A batch manifest should include:

- version,
- ID,
- creation timestamp,
- operation,
- status,
- prompt version,
- schema version,
- input / output / error files,
- remote batch IDs where applicable,
- items,
- summary,
- dependency graph summary,
- local-cache summary,
- prompt-cache grouping summary.

Use atomic state transitions.

Provide migration handling for older manifest versions if required.

---

## 18. Batch grouping for high cacheability

Implement grouping strategies for both text and images.

### 18.1 Story grouping dimensions

```text
model
operation
prompt family + version
language
format
cache shard
```

### 18.2 Image grouping dimensions

```text
model
operation
format
size / aspect bucket
prompt family + version
reference-bundle hash
cache shard
```

### 18.3 Auto grouping policy

`auto` should:

- prefer cache-prefix grouping when enough items share a prefix,
- avoid explicit cache writes for one-off groups,
- merge very small compatible groups where useful,
- keep dependency boundaries intact,
- respect provider file and request limits,
- produce an inspectable planning report.

### 18.4 Reference-bundle identity

Implement a stable identity for reusable image references.

Conceptually:

```ts
interface ReferenceBundleIdentity {
  readonly orderedReferenceHashes: readonly string[];
  readonly referenceRoles: readonly string[];
  readonly detail: 'low' | 'high' | 'auto';
  readonly inputFidelity: 'high' | 'default';
  readonly visualBibleVersion: string;
  readonly promptVersion: string;
}
```

Group scene-image requests by this identity.

Do not include dynamic scene descriptions in the reusable prefix or cache key.

---

## 19. Tests

Add unit, integration and regression tests.

### 19.1 Unit tests

Cover:

- stable prompt-prefix rendering,
- dynamic suffix separation,
- prompt-cache eligibility,
- cache-key construction,
- stable sharding,
- cache breakpoint placement,
- local content-addressed identity hashing,
- cache invalidation,
- batch custom-ID generation,
- batch grouping,
- batch splitting,
- result reconciliation independent of order,
- partial and expired batch handling,
- atomic writes,
- word counting,
- duration calculations,
- language mapping,
- duplicate detection,
- scaffolding detection,
- protected-element validation,
- localization compression checks,
- incomplete response rejection,
- reference-bundle hashing,
- provider reference upload reuse,
- dependency graph planning,
- scene request blocking on missing references,
- image cache-hit behavior,
- image repair routing.

### 19.2 Regression fixtures

Include examples equivalent to:

1. English story containing production commentary.
2. German localized text with repeated boilerplate.
3. Generic placeholder localization.
4. Localized full story that loses story-specific details.
5. A short with bad copied metadata.
6. An invalid localized duration.
7. A scene image request submitted without its references.
8. Multiple scene requests sharing the same reference bundle but not grouped.
9. Duplicate reference-image request collapse.
10. Provider file ID reuse for identical reference images.
11. A failed reference-image generation blocking only dependent scene nodes.
12. One failed scene image among successful siblings.
13. Expired batch with partial results.
14. Local-cache hit requiring no provider request.
15. Prompt-cache group with identical image references and identical prefix.
16. Different scene descriptions appearing only after the breakpoint.

### 19.3 Integration tests

Test:

- canonical English full rewrite,
- canonical English full -> multilingual localization,
- canonical English Short -> multilingual Short localization,
- reference-image batch prepare / ingest,
- scene-image batch prepare / ingest,
- mixed local-cache hits and API requests,
- result ingestion from provider fixtures,
- validation failure followed by repair,
- repair failure followed by blocked state,
- retry manifest containing only unresolved items,
- resume after restart,
- concurrent ingestion protection,
- prompt-version invalidation,
- validator-version revalidation,
- simulation-mode request and JSONL logging,
- two-phase dependency enforcement.

Do not use paid provider calls in standard automated tests.

---

## 20. Documentation

Create or update documentation covering:

- model selection,
- environment configuration,
- local caching,
- OpenAI prompt caching,
- cache-write vs cache-read metrics,
- static-prefix design,
- explicit breakpoint behavior,
- story batch workflows,
- reference-image batch workflows,
- scene-image batch workflows,
- dependency-aware ordering,
- upload / reuse of reference images,
- partial failures,
- retry and resume,
- cache invalidation,
- safe simulation workflow,
- troubleshooting malformed or incomplete responses,
- quality-gate failures,
- example CLI workflows.

Document explicitly that:

- **local-cache hits** avoid provider calls entirely,
- **prompt-cache hits** still make provider calls but reduce repeated input processing,
- higher output ceilings do not force extra spend,
- cache effectiveness must be measured,
- Batch API execution order must not be assumed,
- successful partial results must always be retained,
- reference images must be generated first and validated before dependent scene batches,
- grouping by identical reference bundles is the correct downstream strategy.

---

## 21. Implementation constraints

- Use strict TypeScript.
- Avoid `any` unless justified at a boundary.
- Prefer discriminated unions.
- Validate external JSON at runtime.
- Keep domain code provider-agnostic.
- Keep provider-specific cache fields and file-upload handling inside the provider adapter.
- Preserve public CLI behavior where possible.
- Document intentional changes.
- Use atomic writes.
- Preserve the last valid artifact.
- Make retries idempotent.
- Do not hide provider errors.
- Do not silently accept malformed output.
- Do not silently downgrade models.
- Do not silently activate low-quality generic fallback narration.
- Do not continue into paid media generation from invalid prerequisites.
- Do not perform unrelated repo-wide refactors.
- Keep deterministic validation before model-based validation.
- Keep repair counts bounded.
- Ensure one failed item does not halt unrelated work.

---

## 22. Required deliverables

Produce:

### A. Architecture and root-cause report

Document:

- current execution path,
- existing cache behavior,
- existing batch behavior,
- sources of text and image inefficiency or corruption,
- sources of localization fidelity loss,
- sources of image inconsistency,
- reasons current validators fail to catch issues,
- prompt-prefix opportunities,
- cache invalidation risks,
- dependency-graph design,
- recommended migration.

### B. Implementation plan

Write a staged, independently testable plan before editing.

Do not stop after planning.

### C. Code changes

Implement:

- updated model configuration,
- Responses API support where appropriate,
- static/dynamic prompt separation,
- prompt-cache planning,
- explicit breakpoints,
- stable cache keys and shards,
- prompt-cache metrics,
- local content-addressed caching,
- dependency-aware two-phase image batching,
- provider reference upload / reuse,
- story and image batch preparation,
- ingestion,
- retry and resume,
- validation and repair routing,
- deterministic metadata,
- CLI tooling,
- observability.

### D. Tests and fixtures

Add and run relevant tests.

### E. Documentation

Document configuration and operational workflows.

### F. Verification report

Report:

- files changed,
- commands executed,
- type-check result,
- lint result,
- test results,
- known unrelated failures,
- simulated story-batch request counts,
- simulated reference-image batch counts,
- simulated scene-image batch counts,
- local-cache hit counts,
- prompt-cache group counts,
- estimated reusable prefix sizes,
- generated cache keys,
- generated JSONL paths,
- example retry workflow,
- dependency-ordering proof,
- remaining risks.

### G. Final response

At completion, provide:

1. root causes found,
2. architecture implemented,
3. CLI commands added or changed,
4. local and prompt cache strategies implemented,
5. two-phase image dependency tooling implemented,
6. batch error-resilience behavior,
7. quality gates added,
8. tests executed and results,
9. example environment configuration,
10. example prepare, submit, download, ingest and retry commands,
11. remaining risks and recommended follow-up work.

Do not claim success unless the corresponding code paths were actually implemented and verified.
