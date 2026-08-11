# OpenAI API Cost, Cache, and Effect-Safety Remediation Plan

Status: Phase 0 and Phase 1 implemented; later phases proposed
Created: 2026-08-11
Scope: OpenAI request infrastructure and directly affected production call paths
Source: static implementation audit; no paid verification calls were made

## Review instructions

Review this plan against the cited source files. Treat the audit findings and this
plan as secondary evidence; source code and focused tests remain authoritative.
Challenge any recommendation that would reduce output quality, introduce a second
workflow system, or add distributed coordination without a demonstrated
cross-process execution risk.

Suggested ChatGPT review questions:

1. Are the proposed invariants sufficient to prevent duplicate paid calls?
2. Is one shared request executor the smallest appropriate abstraction?
3. Which call families should use provider prompt caching versus durable result reuse?
4. Does the phase ordering minimize migration risk?
5. Are any acceptance tests missing an important failure mode?
6. Which findings require runtime measurement before implementation?

## Executive decision

Adopt small shared paid-request contracts for deterministic OpenAI work. Retry
ownership stays at one explicitly named transport layer per call family. Durable
claims are conditional on demonstrated or justified cross-process execution;
they are not an automatic responsibility of a generic executor. Keep
domain-specific prompt construction, schemas, artifact models, model routing,
and quality policies in their current packages.

Do not treat these as interchangeable:

- provider prompt-prefix caching;
- durable application result reuse;
- semantic/asset reuse;
- in-flight request deduplication;
- workflow resumability.

## Safety and cost invariants

1. One layer owns transport retries for each request.
2. A logical request has a stable fingerprint across retries.
3. Cross-process claims are added only where multi-process execution is possible
   or demonstrated and a durable cache-fill race is evidenced. Unknown topology
   does not justify a new distributed claim.
4. Provider prompt caching is enabled only for an exact reusable prefix of at
   least the provider minimum length and an expected reuse count of at least two
   within the effective provider cache lifetime/workload burst, with sufficient
   probability that later requests reuse the same prefix.
5. GPT-5.6 explicit caching must serialize the actual provider breakpoint and
   request-wide cache options; an internal breakpoint label is insufficient.
6. `LogicalRequestFingerprint`, `ResultCacheKey`, `PromptPrefixFingerprint`,
   `PromptCacheRoutingKey`, and `BatchSubmissionKey` remain distinct typed
   identities. Provider routing is never a durable result correctness identity.
7. Logical/result identities include every semantically relevant model,
   reasoning, schema, prompt-policy, provider, locale, and source input, while
   excluding timestamps, request IDs, and irrelevant operational metadata.
8. An ambiguous paid media-generation result is not automatically repeated.
9. Paid-work authorization fails closed when cost cannot be estimated where a
   hard monetary budget is required.
10. Every paid request records logical identity, physical attempt, model,
    reasoning, service tier, latency, outcome, and supported usage categories.
11. No prompt text or credentials are required in cost telemetry.
12. Batch submission identity is persisted so a process crash cannot silently
    create the same remote batch twice.
13. Cache telemetry can aggregate request count and requests/minute by
    `PromptCacheRoutingKey`, cache reads/writes, hit rate, and eventual ROI.

## Source-grounded baseline

### Shared cache and telemetry

- `packages/shared/src/prompt-cache.ts` creates deterministic keys and records a
  logical breakpoint, but currently projects only `prompt_cache_key` and
  `prompt_cache_retention`.
- `packages/shared/src/openai-cost-summary.ts` understands cached and cache-write
  tokens when adapters supply them.
- `packages/observability/src/telemetry.ts` does not provide one complete schema
  for reasoning and cache-write usage across call families.
- `packages/observability/src/pricing.ts` appears to add full input-token cost and
  cached-token cost, which can double-count cached input depending on provider
  usage semantics.
- Installed OpenAI SDK source defaults to two retries, while
  `packages/story-localization/src/story-localization-openai-batch.ts` configures
  five retries unless a caller overrides it.

### Highest-risk call paths

- Story calls: `packages/story-localization/src/story-localization.service.ts` and
  `packages/story-localization/src/short-rewrite.service.ts` combine SDK and
  application retries.
- Images: `packages/image-generation/src/episode-image-pipeline.ts`,
  `packages/image-generation/src/openai-image.ts`, and
  `packages/image-generation/src/thumbnail-image-generator.ts` retry statusless
  or timeout failures that may already have incurred a successful paid effect.
- History V3.3: `packages/history/src/history-research-v33.ts` computes prompt
  cache keys without including them in Responses requests; its workflow budget
  can proceed when pricing is unavailable.
- Metadata: `packages/metadata/src/youtube-metadata.ts` uses a raw client that
  drops response usage and compounds file-upload, fallback-model, and repair calls.
- Legacy speech: `packages/speech/src/platform/legacy-application-adapter.ts`
  forces regeneration and bypasses durable reuse available in canonical API speech.
- Transcription: `packages/transcription/src/index.ts` has no durable result cache,
  claim, or per-chunk request telemetry.
- Batch image submission: `packages/image-generation/src/image-batch-service.ts`
  can create a remote batch before persisting its provider identity.

### Strong implementations to preserve

- Canonical speech cache identity and Postgres claim/wait behavior in
  `packages/speech/src/platform/cache-key.ts` and the canonical speech service.
- Source-grounded QA batching, budgets, bounded escalation, and local single-flight
  in `packages/strategic-reinvention/src/source-grounded-visual-qa.ts` and
  `apps/cli/src/veronica-source-grounded-visual-qa-composition.ts`.
- Comprehensive current image-result identity in
  `packages/image-generation/src/cacheable-image-pipeline.ts`.
- Story, metadata, semantic-prompt, and QA artifact fingerprints.
- Existing Story and Image Batch implementations.

## Target architecture

```text
domain/application workflow
        |
        | logical request + policy + fingerprint inputs
        v
typed paid-request descriptor + distinct identities
        |-- call-family retry owner
        |-- optional existing claim when topology justifies it
        |-- future prompt-cache request projection
        |-- normalized usage/outcome telemetry
        v
OpenAI SDK or typed raw transport
        |
        v
result validation -> durable result/cache/artifact -> claim completion
```

These contracts are not an episode service or a workflow framework. They do not
know about scenes, genres, stories, narration, or YouTube metadata. Domain
packages continue to build prompts, execute their existing application policy,
and validate outputs.

## Phase 0 — Measurement contract and safety characterization

Goal: establish stable contracts before changing provider behavior.

Tasks:

1. Add a canonical logical request descriptor containing operation ID, model,
   reasoning, service tier, timeout, retry policy, and stable fingerprint.
   Keep complete logical identity, durable result identity, reusable prefix
   identity, provider routing identity, and remote batch identity type-distinct.
2. Define a discriminated provider outcome that separates success,
   definitely-failed-before-effect, ambiguous-effect, and rejected request.
3. Define a unified usage record for input, cached input, cache-write, reasoning,
   output, image/audio quantities, duration, request ID, and physical attempt.
4. Add static request-projection tests for every active Responses family.
5. Add retry-envelope characterization tests around story, history, metadata,
   image, thumbnail, speech, and transcription paths.
   Record whether each topology is single-process, multi-process possible,
   multi-process demonstrated, or unknown, with source evidence.
6. Correct or replace the cached-input cost calculation only after a focused test
   establishes the provider usage-field semantics.

Exit criteria:

- Existing effective attempt ceilings are executable-test evidence.
- No provider behavior has changed.
- Cost summaries can represent every supported usage category without prompt text.

## Phase 1 — Establish one retry owner

Goal: remove multiplicative and ambiguous retries before optimizing cache hits.

Tasks:

1. For story and short rewrite, configure the SDK with `maxRetries: 0` when the
   application retry policy is active.
2. Apply the same rule to history providers that already have outer retries.
3. Bound metadata model fallbacks and make one layer own transport retry.
4. Separate image error handling into definitely-before-request and ambiguous
   after-dispatch outcomes. Do not automatically retry the latter.
5. Ensure thumbnail generation follows the same ambiguity policy.
6. Preserve retry backoff, jitter, rate-limit handling, and quality repair, but
   record each as a distinct logical reason rather than a hidden transport retry.

Exit criteria:

- Every call family names exactly one retry owner.
- Physical-attempt counts equal the configured envelope in focused tests.
- Timeout/statusless image failures cannot generate an automatic second image.
- Output-quality repair remains distinct from transport retry.

## Phase 2 — Durable request claims for demonstrated races

Goal: prevent two workers from paying for the same deterministic request.

Tasks:

1. First require evidence that a call family is multi-process possible or
   demonstrated and that concurrent cache fills can duplicate paid work.
2. Reuse an existing workflow/persistence lease or claim abstraction if its
   semantics fit deterministic paid requests. Do not create a parallel workflow.
3. Implement claim, wait, complete, failed, and stale-owner recovery around a
   stable logical fingerprint.
4. Apply only to evidence-backed candidates; the Phase 0 classification does not
   yet justify the former unconditional metadata/semantic/history target list.
5. Retain process-local promise coalescing for same-process latency reduction.
6. Do not add distributed claims to single-process or unknown-topology families.

Exit criteria:

- Two concurrent workers for the same fingerprint cause one provider dispatch.
- A crashed owner is recoverable without permanent deadlock.
- Changed semantic inputs create a new claim and cannot reuse the old result.

## Phase 3 — Correct GPT-5.6 prompt-cache projection

Goal: make provider cache configuration real, measurable, and model-aware.

Tasks:

1. Upgrade the OpenAI SDK to a version whose request types support the current
   GPT-5.6 breakpoint and cache-options fields, or add one narrow validated raw
   request projection if upgrading is independently unsafe.
2. Evolve `packages/shared/src/prompt-cache.ts` to project:
   - stable `prompt_cache_key`;
   - `prompt_cache_breakpoint: { mode: "explicit" }` on the final stable block;
   - `prompt_cache_options: { mode: "explicit", ttl: "30m" }` for supported models.
3. Retain legacy retention behavior only for models where it remains supported.
4. Add capability dispatch keyed by actual model family, not string fragments
   scattered across call sites.
5. Migrate semantic prompts and Story Batch first, then source-grounded QA and
   synchronous story calls after prefix/reuse measurement.
6. Fix History V3.3 so the calculated key reaches the request or remove the claim
   that provider caching is configured.
7. Do not cache prefixes under the minimum length or without likely reuse of at
   least two requests inside the provider cache lifetime/workload burst.
8. Aggregate request throughput by `PromptCacheRoutingKey` before considering any
   deterministic routing-key partitioning. Do not shard speculatively.

Exit criteria:

- Provider request snapshots contain real breakpoints/options for GPT-5.6.
- Dynamic suffix changes do not change the serialized stable prefix or cache key.
- Older-model requests do not receive unsupported fields.
- Cache writes and reads appear in imported usage data.

Official reference:
`https://developers.openai.com/api/docs/guides/prompt-caching`

## Phase 4 — Raw client and legacy-path consolidation

Goal: bring reachable bypasses under the shared safety and telemetry boundary.

Tasks:

1. Migrate metadata transport without changing its metadata domain contract,
   fallback policy, or output schema.
2. Parse and persist complete metadata usage before enabling provider caching.
3. Add transcription request identity from audio hash, model, language, prompt,
   response format, and provider configuration; add durable reuse and per-chunk
   telemetry.
4. Migrate production legacy TTS callers to the canonical speech service rather
   than duplicating its cache logic.
5. Classify raw Chat Completions adapters as active external API, compatibility,
   or removable. Migrate only active paths where Responses yields a concrete
   consistency or observability benefit.
6. Keep the deterministic Veronica prompt compiler as the default unless an
   explicit product decision activates the OpenAI adapter.

Exit criteria:

- Metadata, transcription, and migrated TTS calls emit the canonical usage record.
- Re-running an identical transcription or TTS request reuses the durable result.
- No dormant adapter becomes production-reachable accidentally.

## Phase 5 — Batch, Flex, and submission recovery

Goal: use discounted execution only where latency and dependency ordering permit.

Tasks:

1. Keep Story and Image Batch as the primary asynchronous implementations.
2. Persist a batch submission intent/idempotency record before or atomically around
   remote creation; reconcile provider batches after crash before resubmitting.
3. Build a real Batch adapter for offline QA only if operator latency permits a
   24-hour window. Do not label synchronous microbatching as OpenAI Batch.
4. Evaluate Batch for bulk metadata regeneration after its request boundary is
   canonical.
5. Retain Flex for low-priority source-grounded QA. Add Flex only to analysis or
   enrichment workloads that tolerate slower service and resource unavailability.
6. Do not use Batch/Flex for synchronous repair gates that block the active pipeline.

Exit criteria:

- Crash-after-submit resumes by lookup/reconciliation rather than duplicate Batch creation.
- Every service-tier selection is visible in manifests and telemetry.
- Operator documentation states latency and failure tradeoffs.

Official references:

- `https://developers.openai.com/api/docs/guides/batch`
- `https://developers.openai.com/api/docs/guides/flex-processing`

## Phase 6 — Model-routing and FinOps validation

Goal: optimize expected cost only after request counts and cache economics are trustworthy.

Tasks:

1. Preserve current quality-sensitive story model and bounded QA escalation until
   evaluation data supports changes.
2. Verify History luna-to-terra escalation and its quality thresholds using fixtures.
3. Make paid history work fail closed when the required pricing catalog is absent.
4. Benchmark `whisper-1` against `gpt-4o-mini-transcribe` for repository languages
   before unifying the inconsistent defaults.
5. Produce per-operation metrics for normal requests, retries, repairs, escalations,
   cache reads, cache writes, and unpriced calls.
6. Add alerts or command failure for unpriced production calls where a hard budget applies.

Exit criteria:

- Cache-read percentage and cache-write ROI are answerable by operation/model.
- Retry and repair costs are separately attributable.
- No cheaper-model recommendation is adopted without quality evidence.

## Focused test plan

### Fingerprints and caching

- Identical logical inputs produce identical request fingerprints.
- Irrelevant timestamps, IDs, and paths do not alter reusable-prefix keys.
- Model, reasoning, schema, prompt-policy, locale-sensitive content, source, and
  provider changes invalidate result caches.
- Dynamic suffix changes preserve the byte-identical stable prefix.
- GPT-5.6 and legacy model cache projections contain only supported fields.
- History's recorded cache key is present in the provider request.

### Retry and ambiguity

- Application-owned retries configure SDK retries to zero.
- Retry identities remain stable across physical attempts.
- Quality repair creates a new logical stage without losing parent identity.
- Ambiguous image and thumbnail outcomes cause no automatic second generation.
- Definitely-pre-dispatch failures follow the bounded retry policy.

### Concurrency and recovery

- For call families selected by demonstrated topology evidence, two concurrent
  identical cache misses cause one provider call.
- A stale claim can be recovered without duplicate completed results.
- Batch crash after remote creation reconciles rather than resubmits.
- Canonical TTS keeps its current cross-worker reuse behavior.

### Telemetry and FinOps

- Metadata parsing retains complete usage.
- Cached, uncached, cache-write, reasoning, and output tokens aggregate correctly.
- Cached tokens are not double-priced.
- Unpriced hard-budget work fails closed.
- No secrets or raw prompts are required in telemetry.

## Controlled live verification gate

No live verification may run without explicit human approval and a hard spend cap.

After static projection tests pass, the smallest experiment is:

1. Two semantic-prompt Responses requests sharing at least 1,200 stable tokens and
   differing only in a short dynamic suffix.
2. Two source-grounded QA requests sharing the same rubric/schema and differing
   only in scene payload.
3. Two Story Batch items sharing the compiled contract and different story inputs.

Maximum: six text calls, configured spend ceiling USD 0.10. Capture request ID,
model, reasoning, tier, input/cached/write/reasoning/output tokens, latency, and
cache-key hash. Do not log prompt contents. Abort if the first request family does
not expose the expected usage fields.

## Rollout and rollback

1. Land measurement contracts and characterization tests separately.
2. Change one retry-owning call family at a time behind existing configuration.
3. Deploy cache projection first to a low-volume measured family.
4. Compare success rate, latency, paid call count, cache-write cost, and output
   validation results before expanding.
5. Roll back request projection or retry policy independently; never invalidate
   durable application caches merely to disable provider prefix caching.

## Explicit non-goals

- No prompt shortening without quality and total-cost evidence.
- No repository-wide CLI decomposition.
- No provider or image-pipeline consolidation unrelated to request safety.
- No production quality-policy or remediation-policy redesign.
- No model downgrade based only on price.
- No new workflow framework.
- No use of `previous_response_id` presented as token-cost elimination.
- No paid verification without approval.

## Completion criteria

The remediation is complete when:

- every reachable paid OpenAI call is registered in the canonical inventory;
- exactly one layer owns retries per call family;
- ambiguous media outcomes cannot trigger blind paid retries;
- demonstrated concurrent cache misses are atomically deduplicated;
- GPT-5.6 explicit cache fields reach the provider correctly;
- application cache identities pass semantic invalidation tests;
- cache reads, writes, reasoning, retries, repairs, and costs are observable;
- metadata and other active raw paths no longer bypass safety/telemetry;
- Batch submissions survive process failure without duplicate remote work;
- hard paid budgets fail closed when pricing is unavailable;
- focused tests pass without paid provider calls;
- controlled live verification, if authorized, stays within its call and spend caps.

## Recommended implementation sequence

1. Phase 0: measurement contracts.
2. Phase 1: retry ownership and ambiguous media safety.
3. Phase 2: durable request claims.
4. Phase 3: GPT-5.6 cache projection.
5. Phase 4: metadata, transcription, and legacy TTS migration.
6. Phase 5: Batch/Flex recovery and expansion.
7. Phase 6: model and FinOps validation.

Do not begin later phases merely because an earlier change compiles. Each phase
must meet its exit criteria and focused test budget first.
