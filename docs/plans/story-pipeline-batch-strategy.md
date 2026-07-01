# Story Pipeline Batch Strategy

Provider-side Batch API is an execution optimization only. Workflow correctness, dependencies, validation, fallback, cache, status, and retry ownership remain in the workflow manifest.

| Stage | Current path | Provider Batch support | Local batching | Parallelism | Recommended execution mode | Batch key | Failure granularity | Retry mode | Persistence | Expected saving | Latency |
| ----- | ------------ | ---------------------- | -------------- | ----------- | -------------------------- | --------- | ------------------- | ---------- | ----------- | --------------- | ------- |
| English full rewrite | `story-localization.service.ts`, batch service operation `canonical-english-full` | Existing `/v1/responses` support | Yes | No until source accepted | Sync by default; batch only for bulk multi-episode runs | `episode:canonical-english-full:en:fingerprint` | one episode | Sync retry/fallback; batch retry item in bulk mode | canonical artifact + workflow stage + batch manifest | Low for one episode; useful bulk | Batch latency usually not worth single workflow critical path |
| English source fallback validation | `generated-story-validator.ts`, planned adapter | Not applicable | Yes | No | Sync local | stage fingerprint | stage | no provider retry | workflow stage | no provider cost | Immediate |
| English quality analysis | `story-production-analysis.service.ts` | Not implemented but compatible with `/v1/responses` structured output | Yes | After candidate exists | Sync for single episode; provider batch for many quality items | `quality:en:full:<candidateFingerprint>` | one story format | retry provider/transient only | analysis artifact + workflow stage | Medium in bulk | Batch delays gate |
| Localized full generation | `story-localization.service.ts`, `story-localization-batch-service.ts` | Existing `/v1/responses` support | Yes | Yes, per locale | Provider batch for `de/fr/es/pt` when `--batch text`; sync fallback | `localize-full:<locale>:<canonicalFingerprint>:<promptFingerprint>` | one locale | failed item retry only | localized artifact + batch manifest + workflow stage | Medium if 4 locales and shared setup | 24h window can slow completion |
| Localized full fallback validation | planned resolver + validator | Not applicable | Yes | Yes | Sync local | `fallback-full:<locale>:<artifactFingerprint>` | one locale | no retry for content failure | workflow stage | no provider cost | Immediate |
| Localized quality analysis | production analysis planned extension | Not implemented but compatible | Yes | Yes | Local grouped sync or provider batch in bulk mode | `quality:<locale>:full:<fingerprint>` | one locale | failed item retry only | analysis artifact + workflow stage | Medium in bulk | Delays each locale gate |
| English short adaptation | `short-rewrite.service.ts` | No provider batch path currently | Yes | After English full accepted | Sync initially | `rewrite-short:en:<parentHash>:<contractHash>` | one short | existing repair/regenerate | short manifest + workflow stage | Low | Immediate feedback preferred |
| Localized short adaptation | `short-rewrite.service.ts` | No provider batch path currently | Yes | Yes after each full accepted | Local concurrency-limited sync | `rewrite-short:<locale>:<parentHash>:<contractHash>` | one locale short | existing repair/regenerate | short manifest + workflow stage | Low-medium; local concurrency enough | Lower than provider batch |
| Short quality analysis | planned production analysis extension | Not implemented but compatible | Yes | Yes | Sync initially; batch for bulk | `quality:<locale>:short:<fingerprint>` | one short | provider retry only | quality artifact + workflow stage | Medium in bulk | Gate latency |
| Metadata generation | `metadata/src/youtube-metadata.ts` | Not currently batch-ready; uses file upload + Responses | Local batch possible | Yes | Sync or local concurrency-limited; do not provider-batch first | `metadata:<locale>:<format>:<storyFingerprint>:<sceneFingerprint>` | one locale format | retry/fallback model in package | metadata generation info + workflow stage | Low due file upload overhead | Sync acceptable |
| Scene extraction/planning | `transcription`, `scene-planning`, image pipeline visual plan | No | Local batch possible | English visual only first | Sync/local | `scenes:en:full:<storyFingerprint>:<sceneConfig>` | whole visual plan | retry only provider-backed parts | scene plan + workflow stage | Low | Critical for images |
| Image prompt generation | `episode-image-pipeline.ts` local prompt builders | No | Yes | Per scene | Local concurrency | `image-prompt:<sceneId>:<visualPlanHash>:<style>` | scene | regenerate prompt | prompt/manifests + workflow | no provider cost | Fast |
| Image generation | `image-batch-service.ts` | Existing `/v1/images/generations` and edits | Yes | Per scene | Provider batch for many scenes; sync/resume for small retries | `image:<sceneId>:<promptHash>:<providerRequestHash>` | scene | retry failed scenes only | image batch manifest + scene manifest + workflow stage | High for many images | Batch latency acceptable for production |
| Thumbnail prompt/generation | `story-thumbnail.ts` | Not integrated with provider batch | Local batch possible | Per locale/format | Sync initially | `thumbnail:<locale>:<format>:<metadataFingerprint>:<settings>` | thumbnail | retry one thumbnail | thumbnail manifest + workflow | Low | Sync acceptable |
| TTS/audio | `speech/src/index.ts` | No known provider batch support in repo | Local concurrency-limited | Per locale/format/segment | Sync/concurrency-limited | `audio:<locale>:<format>:<voiceFingerprint>:<storyFingerprint>` | audio segment or full artifact | fallback model/retryable provider errors | audio manifests + workflow | Provider batch not applicable | Needs timely validation |
| Captions/subtitles | `alignment`, transcription helpers | No | Yes | Per locale/format | Local sync | `captions:<locale>:<format>:<audioFingerprint>` | locale format | rerun local | captions + workflow | no provider cost | Fast |
| Rendering | `rendering/src/index.ts` | No | Remote batch/local concurrency | Per render/clip | Local/remote concurrency-limited | `render:<locale>:<format>:<depsFingerprint>` | clip/render | remote retry/local fallback | render manifests + workflow | no token saving | CPU/GPU/disk bound |
| Publishing | `youtube-upload/src/index.ts` | No | Queue possible | Low | Serial/queued | `publish:<locale>:<format>:<publicationFingerprint>` | upload | retry retryable upload only | upload report + workflow | no token saving | Operationally serial |

## Provider Batch Custom ID Format

Use existing deterministic style when possible:

```text
dte:<episodeNumber>:<stageType>:<locale-or-none>:<format>:<inputHash8>:<configHash8>[:rN]
```

The workflow manifest stores a full mapping from `customId` to `stageId`, `artifactId`, dependency fingerprints, and retry parent.

## Batch Persistence Requirements

- Persist local manifest before submission.
- Persist provider input file ID and batch ID.
- Poll/reconcile status without mutating stage success until per-item validation passes.
- Persist output/error JSONL and per-item imported artifacts.
- Failed items become independent retry candidates with a parent batch reference.
- Expired/cancelled batches leave each item in a retryable or cancelled state according to provider status and workflow cancellation.

## Stages That Should Remain Synchronous Initially

- English critical path for one episode.
- Source fallback validation and gate.
- Local deterministic validation.
- TTS/audio.
- Rendering and publishing.
- Metadata until file-upload-backed provider batch design exists.
