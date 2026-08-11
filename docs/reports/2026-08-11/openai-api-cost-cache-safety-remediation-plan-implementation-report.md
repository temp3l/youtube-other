# OpenAI API Cost/Cache Safety Remediation Plan — Implementation Report

Source plan: `docs/plans/openai-api-cost-cache-safety-remediation-plan.md`
Date of execution: 2026-08-11

## Summary

Implemented corrected Phase 0, Phase 1, and bounded Phase 2A. The shared layer now distinguishes
complete logical identity, result-cache identity, reusable prompt-prefix identity,
provider cache-routing identity, and Batch submission identity. It also defines a
privacy-safe paid-request descriptor, normalized mutually exclusive usage, paid
effect outcomes, retry envelopes, and future per-routing-key throughput/ROI
measurement. Existing domain services remain request owners.

Transport retry multiplication was removed where application loops already own
retry: full story, short rewrite, History claim/V3.6, and injected speech SDK calls.
Metadata fallback cardinality is bounded. Current, legacy, and thumbnail image
generation disable SDK retries and treat a statusless/timeout result after dispatch
as ambiguous, with no second generation or curl fallback.

Phase 2A adds audited model capabilities and a typed Responses projection. Story
Batch is the only initial GPT-5.6 explicit-cache family: qualifying requests now
carry a stable routing key, a real breakpoint on the final system `input_text`,
and request-wide explicit mode with `30m` TTL. Older/unknown models fail closed.
History V3.3’s sub-threshold prefixes no longer claim a provider cache key.
The installed SDK lacks these request types; because the enabled path is raw
Story Batch JSONL and an SDK 7 major upgrade would touch four provider packages,
the implementation uses a narrow typed projection with no unsafe cast.

## Files changed

- Shared: `packages/shared/src/openai-paid-request.ts`,
  `openai-paid-request.unit.test.ts`, `index.ts`.
- Observability: `packages/observability/src/pricing.ts`, `telemetry.ts`,
  `pricing.unit.test.ts`.
- Retry owners: `packages/story-localization/src/story-localization.service.ts`,
  `short-rewrite.service.ts`, their unit tests;
  `packages/history/src/history-research-v33.ts`,
  `v36/bounded-llm-relation-proposer-v36.ts`, History unit test;
  `packages/speech/src/index.ts`, `index.unit.test.ts`.
- Metadata: `packages/metadata/src/youtube-metadata.ts` and unit test.
- Media safety: `packages/image-generation/src/episode-image-pipeline.ts`,
  `openai-image.ts`, `thumbnail-image-generator.ts`, and their focused unit tests.
- Documentation: source plan and
  `docs/architecture/openai-paid-call-characterization.md`.
- Phase 2A: `packages/shared/src/prompt-cache.ts`, Story Batch service/types and
  focused test, History provider/test, and routing economics telemetry.

## Tasks completed

- Five type-distinct identities and deterministic constructors.
- Canonical descriptor, usage, outcome, and retry-envelope contracts.
- Cache-routing request/minute, read/write, hit-rate, token, and ROI aggregation.
- Source-evidenced retry and execution-topology matrices.
- Confirmed and corrected cached-input double pricing; cache-write tokens are also
  excluded from ordinary input and missing category prices fail visibly.
- One transport retry owner for the changed structured text and injected speech paths.
- Fail-closed metadata fallback ceiling.
- No blind retry of ambiguous scene-image, legacy-image, or thumbnail effects.
- Actual GPT-5.6 explicit provider projection for eligible Story Batch groups.
- Cache-write usage import plus routing-key rate/read/write/net-savings/ROI fields.

## Tasks partially completed

- Canonical usage contracts exist and observability accepts cache-write/reasoning
  fields, but every legacy/raw adapter does not emit the normalized record yet.
- Retry envelopes are source-characterized; the two broad focused suites remain
  obstructed by unrelated repository fixture changes.

## Tasks not completed

- Distributed claims/locks or new durable reuse.
- Batch/Flex expansion, model/reasoning changes, prompt shortening, raw-client
  consolidation, and live paid verification.

## Deviations

The original plan’s generic executor/claim ownership was corrected: contracts are
shared, while retry execution remains in existing application services and claims
are conditional on proven topology. Reuse eligibility now includes provider cache
lifetime/workload-burst probability. No speculative routing-key sharding was added.

## Tests/checks and results

- `pnpm --filter @mediaforge/shared build`: passed.
- Broad focused unit selection: 51 passed before unrelated
  `scene.referenceCharacterIds` fixture failure.
- Exact safety selection: 18 passed before unrelated story-IR fixture contract
  failure. New shared, pricing, History, metadata, current/legacy image, and
  thumbnail cases passed.
- Affected-package typecheck: shared, observability, metadata passed; story exited
  2 without diagnostics. Mock signatures were corrected after that run; policy
  prevented another typecheck.
- No paid requests were made.

Phase 2A verification:

- Story package typecheck initially exposed stale custom-client mock signatures;
  corrected centrally, then passed.
- Exact short-rewrite Phase 0/1 safety test passed. Two full-story tests remain
  blocked before provider dispatch by stale Story IR fixtures.
- Shared build exposed and then passed after correcting the legacy `24h` TTL
  capability union. History/Story builds passed.
- Shared cache/identity tests passed (20). The combined final run then stopped on
  a pre-existing missing History episode fixture before the new Story Batch file.
- A compiled Story Batch projection smoke check passed the breakpoint, explicit
  options, and cross-suffix routing-key invariants.
- No paid requests were made.

## Risks and next steps

Repair the unrelated Story IR and History episode fixtures, then execute the new
Story Batch projection test file. A separately approved two-call Story Batch live
experiment is required before expanding caching. Durable claims should target only
demonstrated multi-process races; Image Batch submission remains the strongest
evidenced future claim/reconciliation candidate.

## Controlled live verification result

Verdict: **FAIL before provider dispatch**. Official Batch documentation does not
guarantee item execution order, so sequential Responses was selected. Static
preflight then measured the representative Story Batch stable system block at 144
estimated tokens versus the 1,024-token minimum. Prefix/routing identity equality,
logical identity inequality, and byte equality passed, but cache eligibility and
breakpoint projection correctly failed closed. Paid requests: 0. Measured cost:
USD 0.00.

Follow-up offline reconciliation showed that the 144-token result measured only
explicit message content. The Structured Outputs schema is documented provider
prefix material and was absent from the estimator and prefix fingerprint.
Accounting now separates explicit-content from effective provider-prefix tokens,
includes exact stable schema/tool serialization in identity and grouping, and
keeps dynamic narration excluded. Current-source results are variant-dependent:
full/ordinary localization 820, English short 746, and affect-preserving
localization 1,105 estimated tokens; tools are absent. Only the last is eligible,
and only when at least two exact-prefix items share a burst. Another paid test is
not warranted until that reuse topology is observed.
