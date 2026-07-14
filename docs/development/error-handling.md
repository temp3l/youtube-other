# Error Handling

## Shared Pattern

- Domain and package-specific error types usually carry an explicit `retryable` flag.
- The practical boundary is simple: transient transport, capacity, and timeout failures are usually retryable; validation, schema, configuration, and duplicate-state failures are usually terminal until inputs change.

## Story Localization and Short Rewrite

- Story localization validates config early, performs structured-output validation, and can run repair prompts when output shape or content constraints fail.
- Short rewrite explicitly classifies transient OpenAI and network failures, retries them with backoff, and can escalate token ceilings through repair or retry settings.
- Both flows persist request and response debug artifacts when enabled, which makes failures inspectable without replaying the call.
- OpenAI-related debug logs are written as structured JSON under `<episode-root>/debug/openai-calls/` when an episode root is known, otherwise under `debug/openai-calls/unscoped/`. Future OpenAI callers should pass explicit `{ episodeRoot, operation, stage, attempt, mode, paidProviderCalled }` context rather than deriving it from output paths.
- Story rewrite requests log the final Responses API envelope before provider dispatch so mock, dry-run, retry, and skipped paths do not lose prompt visibility. Image base64 payloads, authorization headers, cookies, API keys, bearer tokens, and suspicious large base64-like strings are redacted before debug files are written.

## Metadata Generation

- Metadata generation has retryable OpenAI error handling, timeout control through `AbortSignal.timeout(...)`, and fallback-model support when the primary model is at capacity.
- Non-retryable schema or validation failures stop the flow instead of silently degrading the output.

## Images

- Image generation persists manifests, checkpoints, and per-scene failure files.
- Resume commands skip completed scenes and skip persisted non-retryable failures unless forced.
- Retryable provider or transport failures are recorded so later resumes can selectively retry only those scenes.

## Rendering

- Local rendering relies on process-runner timeouts around `ffmpeg`.
- Remote rendering can retry SSH or worker failures up to configured limits and optionally fall back to local rendering.
- Render validation is a separate failure point after encoding completes.

## Educational Speech

- Semantic chunks and candidates are content-addressed and written atomically. Resume retains every
  valid candidate and starts provider work at the first missing or invalid entry.
- Rate-limit, timeout, network, capacity, and 502/503/504 failures receive at most three bounded
  attempts. Authentication, unsupported language, bad input/configuration, schema errors, and
  deterministic client failures do not retry.
- A zero-byte, incomplete, undecodable, hash-mismatched, or failed-validation file is never promoted.
  The accepted narration is replaced only after all selected chunks, assembly, and mastering pass.
- `--speech-dry-run` reads cache metadata but performs no provider call and creates no final artifact.

## YouTube Upload

- Upload failures are categorized as configuration, validation, duplicate, or generic upload errors.
- Duplicate detection is terminal by design because upload is treated as a finalization boundary, not an idempotent overwrite.

## Observability

- Root npm scripts emit telemetry start and end events through `scripts/run-with-telemetry.mjs`.
- Runtime logging uses Pino.
- Redaction covers API keys, authorization fields, cookies, access tokens, and signed URLs.

## Token Exhaustion and Truncation

- Story rewrite and localization code exposes max-output-token and retry-max-output-token controls.
- When repair or retry paths are used, the code can raise or reuse token ceilings rather than assuming the first truncated output is final.

## Idempotency and Resume Boundaries

- Story localization: cache entries, batch manifests, and output files
- Images: per-scene manifests, checkpoints, and failure files
- Rendering: scene clip manifests plus output validation
- Upload: upload reports and duplicate checks, with no implicit overwrite of published state
