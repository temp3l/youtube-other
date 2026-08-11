# OpenAI Paid-Call Characterization

Status: Phase 0 baseline plus Phase 2A provider-cache projection
Date: 2026-08-11
Method: static source inspection and offline tests; no paid calls

This matrix characterizes transport attempts. Repair, fallback, and escalation are
separate logical actions and are never counted as transport retries. “Single
process” describes the supported invocation that was traced; the cross-process
column avoids inferring deployment topology that source does not prove.

## Retry ownership

| Call family | SDK retries | Application retries | Separate actions | Maximum physical requests | Owner / evidence |
|---|---:|---:|---|---:|---|
| Story full/localization structured call | 0 | 4 | regeneration/validation repair, up to 4 logical calls | 5 per logical call; 20 workflow upper bound | Application; `callOpenAiStructured` |
| Story short structured call | 0 | 2 | one regeneration and one paid repair | 3 per logical call; 9 per locale | Application; `requestStructuredShortRewrite` |
| Story connectivity preflight | configured SDK only | 0 | none | SDK configuration + 1 | SDK; `preflightOpenAiConnectivity` |
| Semantic image-prompt derivation | 0 in production composition | 1 | validation repair is the second attempt | 2 per chunk | Application; `deriveSemanticImagePrompts` |
| Source-grounded visual QA | 0 | 2 | bounded remediation/advisor/escalation | 3 per scheduled logical batch; workflow formula below | Scheduler; `SourceGroundedQaScheduler` |
| History V3.3 claim extraction | 0 | 2 | none | 3 per extraction batch | `ResilientClaimExtractionProviderV33` |
| History V3.3 web/evidence/visual calls | 3 | 0 | evidence model escalation separate | 4 per logical action | SDK client composed by CLI |
| History V3.6 bounded proposer | 0 | 1 | none | 2 per selected window | `retryHistoryProviderCallV33` |
| Metadata file upload or Responses call | 0 (raw curl) | configured, default 3 | at most 2 fallback models and 2 repairs | 4 per action; at most 4 upload + 20 response calls | `withRetry`; fallback cap is fail-closed |
| Current scene image generation | 0 | default 2, pre-dispatch only | none | at most 1 paid dispatch per item | Application owns safe preparation retry; ambiguous dispatch stops |
| Legacy scene image generation | 0 for injected SDK request | default 2, pre-dispatch only | none | at most 1 paid dispatch per item | Same ambiguity boundary; raw curl fallback removed after dispatch |
| Thumbnail image edit | 0 | default 2, pre-dispatch only | candidate generation is separate | at most 1 paid dispatch per candidate | Application; ambiguous dispatch stops |
| Canonical speech chunk | 0 for injected SDK request | default 2 | configured model fallback separate | 3 per model/chunk | `SpeechGenerationService`; existing DB claim unchanged |
| Legacy speech adapter | 0 for injected SDK request | default 2 | configured model fallback separate | 3 per model/chunk/invocation | Same application service, but no durable reuse in legacy facade |
| Transcription chunk | 0 (curl) | 0 | one call per chunk | 1 per chunk | No retry owner |
| Story Batch control plane | configured SDK, default 5 | 0 | manual failed-item retry batch | 6 per control action; one provider execution per submitted item | SDK; Batch API owns item execution |
| Image Batch control plane | configured SDK, default 2 | 0 | explicit retry-failed batch | 3 per control action; one provider execution per submitted item | SDK; submission crash gap remains |

For source-grounded QA with `N` scenes and batch size `B` (7 short, 5 long),
the existing bounded authorization formula remains approximately
`(4*ceil(N/B) + ceil(N/5) + 1) * 3` provider attempts for one remediation round,
or `(6*ceil(N/B) + 2*ceil(N/5) + 1) * 3` for two. These are budgeted logical
actions plus scheduler-owned retries, not nested SDK retries.

## Execution topology

| Call family | Classification | Evidence and limitation |
|---|---|---|
| Canonical speech | multi-process demonstrated | Postgres generation claim/wait/reclaim in `apps/api/src/postgres-speech-use-cases.ts`; consumed by `SpeechGenerationService` |
| Image Batch submission | multi-process possible | Shared persistent batch manifests can be submitted by concurrent CLI processes; submission has no claim/lock |
| History research providers | unknown | History has worker-thread tooling, but source does not prove that paid V3.3 research runs through that pool |
| Story localization/full | single-process | CLI composition and in-memory async concurrency; cross-process deployment remains unknown |
| Short rewrite | single-process | In-memory queue/workers and `Promise.all`; cross-process deployment remains unknown |
| Semantic image prompt | single-process | Direct local pipeline composition; cross-process deployment remains unknown |
| Source-grounded QA | single-process | Bounded in-memory scheduler and local single-flight; cross-process deployment remains unknown |
| Metadata | single-process | Direct CLI invocation; cross-process deployment remains unknown |
| Current/legacy image generation | single-process | In-memory scene concurrency; cross-process deployment remains unknown |
| Thumbnail | single-process | Direct CLI generation; cross-process deployment remains unknown |
| Legacy speech facade | single-process | Local facade; API use may sit behind the canonical speech claim |
| Transcription | single-process | Direct CLI chunk loop; cross-process deployment remains unknown |
| Story Batch | multi-process possible | Provider Batch plus persisted manifests; concurrent submit topology is not proven |

These classifications do not authorize new distributed claims. Phase 2 must first
prove a multi-process cache-fill race. Local single-flight remains appropriate for
same-process duplicates; canonical speech keeps its demonstrated Postgres claim.

## Identity and measurement contract

- `LogicalRequestFingerprint`: complete correctness identity, stable over retry.
- `ResultCacheKey`: durable reusable output identity.
- `PromptPrefixFingerprint`: reusable static provider prefix only.
- `PromptCacheRoutingKey`: provider routing/throughput grouping, never correctness.
- `BatchSubmissionKey`: deterministic remote submission identity.

Normalized usage makes uncached, cached, and cache-write input mutually exclusive.
Routing telemetry can calculate request count and peak requests/minute per routing
key, reads, writes, hit rate, token totals, and ROI once adapters emit the records.
Story Batch now emits an actual GPT-5.6 explicit breakpoint and request-wide
cache options. Routing-key sharding remains deferred pending throughput evidence.

## Phase 2A prompt-cache eligibility

Prefix sizes are the conservative offline estimate from `estimatePromptTokens`;
runtime planning remains fail-closed at 1,024 estimated tokens and requires at
least two requests in the same effective 30-minute workload burst.

| Text/reasoning family | Stable prefix evidence | Classification | Status |
|---|---|---|---|
| Story Batch full/localization/short | Compiled system contract; grouped exact bytes and model, often >1,024 estimated tokens | EXPLICIT_CACHE_ELIGIBLE when group count >=2 | **ENABLED** for audited GPT-5.6 models |
| Story synchronous full/localization | Same large contracts, but no proven repeated prefix inside one cache lifetime | NEEDS_RUNTIME_MEASUREMENT | Deferred |
| Story short synchronous | Stable system contract; burst reuse not established | NEEDS_RUNTIME_MEASUREMENT | Deferred |
| Semantic image-prompt derivation | Stable instruction is roughly 120 estimated tokens | NOT_CURRENTLY_CACHE_WORTHWHILE | Deferred; no padding |
| Source-grounded visual QA | Stable rubric and same-process batching exist; rendered prefix size varies by policy | NEEDS_RUNTIME_MEASUREMENT | Deferred |
| History V3.3 claim/evidence/visual | Stable prefixes are roughly 70–100 estimated tokens | NOT_CURRENTLY_CACHE_WORTHWHILE | Canonical planner emits no provider-cache claim |
| History V3.3 web search | Dynamic query/tool work has no sufficiently large reusable prefix | NOT_CACHEABLE | Disabled |
| History V3.6 relation proposer | Short policy prefix and bounded shadow use | NOT_CURRENTLY_CACHE_WORTHWHILE | Deferred |
| History visual direction V1 | Stable direction policy is roughly 130 estimated tokens; default is legacy GPT-4.1 | AUTOMATIC_OR_LEGACY_CACHE_ONLY | No GPT-5.6 fields |
| Story production analysis | Stable schema/instructions, but call reuse in a 30-minute burst is unproven | NEEDS_RUNTIME_MEASUREMENT | Deferred |
| Dynamic genre | Stable instructions but normally one artifact-producing call | NOT_CURRENTLY_CACHE_WORTHWHILE | Durable result reuse preferred |
| Metadata | Raw Responses client, dynamic instructions, default GPT-5.4-mini | AUTOMATIC_OR_LEGACY_CACHE_ONLY | No GPT-5.6 projection |
| Veronica post-image QA | Multimodal request with changing image and short reusable instructions | NOT_CURRENTLY_CACHE_WORTHWHILE | Durable artifact cache retained |

Image generation, speech, transcription, and image Batch endpoints are not
Responses prompt-prefix-cache families.

### SDK projection decision

The installed OpenAI 6.44/6.45 typings expose legacy
`prompt_cache_retention` but not GPT-5.6 `prompt_cache_options`, content-block
breakpoints, or `cache_write_tokens`. OpenAI 7.4 contains those types, but a major
upgrade would span four provider packages and dozens of SDK references. The
initial enabled path is Story Batch JSONL, so Phase 2A uses one narrow typed raw
Responses projection rather than broad casts or a repository-wide SDK upgrade.
SDK-backed families remain deferred until their eligibility independently
justifies that upgrade. The raw shape is based on the official Prompt Caching
guide and is structurally tested without a provider call.

## Next-phase cache recommendation

- **A — explicit prefix caching:** Story Batch is enabled. Source-grounded QA and
  synchronous story require rendered-prefix and same-burst measurements first.
  Semantic prompts and History V3.3 are below the minimum and should not be padded.
- **B — durable application reuse:** transcription needs a result identity/cache;
  legacy speech should migrate to canonical speech reuse rather than copy it.
  Metadata already has durable artifacts but needs safer cache-fill coordination
  only if multi-process execution is proven.
- **C — local single-flight:** metadata, story, semantic prompts, current image
  result fills, and source-grounded QA are appropriate candidates under their
  currently traced single-process invocation topology.
- **D — durable cross-process claims:** keep canonical speech’s existing claim.
  Investigate Image Batch submission intent/reconciliation. Add no other claim
  until runtime evidence upgrades its topology classification.
- **E — no additional provider prompt caching:** image, thumbnail, speech, and
  transcription endpoints do not use Responses prompt-prefix caching. Their cost
  controls are result reuse, effect safety, and observability.
