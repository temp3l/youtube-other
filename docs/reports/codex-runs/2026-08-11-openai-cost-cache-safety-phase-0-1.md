# OpenAI Cost/Cache Safety Phase 0–1

Date: 2026-08-11

## Changed files

- `packages/shared/src/openai-paid-request.ts`, `index.ts`, unit test: distinct
  paid-request identities, descriptors, normalized usage/outcomes, retry-envelope
  characterization, and future routing-key throughput/ROI summaries.
- `packages/observability/src/pricing.ts`, `telemetry.ts`, pricing unit test:
  mutually exclusive token pricing and cache-write/reasoning usage fields.
- Story, short-rewrite, History V3.3/V3.6, and speech request boundaries/tests:
  application-owned retries now pass SDK `maxRetries: 0`.
- Metadata implementation/test: fail-closed two-fallback ceiling.
- Current/legacy image and thumbnail generators/tests: SDK retries disabled and
  ambiguous post-dispatch outcomes cannot automatically retry or fall back.
- Plan and `docs/architecture/openai-paid-call-characterization.md`: corrected
  identity, topology, claim, reuse-lifetime, retry, and measurement architecture.

## Checks

- Shared package build: passed.
- Exact focused safety selection: 18 passed before an unrelated story fixture
  contract failure; all reached new identity/pricing/history/metadata/image tests passed.
- Broader focused run: 51 passed before an unrelated image fixture failure.
- Affected-package typecheck: shared, observability, metadata passed; story failed
  without emitted diagnostics. Test mock signatures were corrected afterward; not
  rerun because the verification budget was exhausted.

## Risks and follow-up

Speech/story retry-option assertions remain unverified due bail-first unrelated
failures. Prompt-cache projection, claims, Batch/Flex, model routing, and paid live
verification were intentionally not performed.
