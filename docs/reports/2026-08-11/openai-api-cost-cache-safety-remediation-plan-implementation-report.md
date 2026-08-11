# OpenAI API Cost/Cache Safety Remediation Plan — Implementation Report

Source plan: `docs/plans/openai-api-cost-cache-safety-remediation-plan.md`
Date of execution: 2026-08-11

## Summary

Implemented corrected Phase 0 and Phase 1 only. The shared layer now distinguishes
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

## Tasks partially completed

- Canonical usage contracts exist and observability accepts cache-write/reasoning
  fields, but every legacy/raw adapter does not emit the normalized record yet.
- Retry envelopes are source-characterized; the two broad focused suites remain
  obstructed by unrelated repository fixture changes.

## Tasks not completed

- Provider prompt-cache projection or routing changes.
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

## Risks and next steps

Re-run the exact speech/story assertions after the unrelated story fixture contract
is repaired, then run one affected-package typecheck. The planned cache-projection
phase should instrument high-reuse text families before tuning keys. Durable claims
should target only demonstrated multi-process races. Canonical speech needs no new
claim. Image Batch submission is the strongest currently evidenced future claim/
reconciliation candidate.
