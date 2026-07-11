# Two-Phase Cacheable MediaForge Pipeline Plan

Date: 2026-07-11

## Scope and baseline

Strengthen the existing story localization and image batch implementations. Do not
replace the current CLI, batch manifests, episode path resolver, Responses API,
atomic storage, validation, retry lineage, or debug logging.

## Stage 1: configuration contracts

- Add the recommended text and image defaults and strict environment parsing.
- Validate model/reasoning combinations without fallback or downgrade.
- Preserve explicit runtime, episode, and environment override precedence.
- Verify with focused configuration and image configuration unit tests.

## Stage 2: reusable prompt and cache primitives

- Add deterministic static-prefix/dynamic-suffix rendering.
- Add typed prompt-cache plans, privacy-preserving keys, eligibility, token
  estimation, and stable sharding.
- Add content-addressed story and image generation identities.
- Verify canonical rendering, breakpoint placement, key privacy, sharding, and
  identity invalidation with unit tests.

## Stage 3: dependency-aware image planning

- Add stable ordered reference-bundle identities.
- Group scene requests by model, operation, format, size, prompt family,
  reference bundle, and shard.
- Add a DAG planner that blocks only nodes whose dependencies are unresolved.
- Persist cache and dependency planning metadata in backward-compatible batch
  manifests.
- Verify missing-reference blocking, independent progress, duplicate collapse,
  grouping, and deterministic custom IDs.

## Stage 4: provider and cache integration

- Put provider-specific prompt cache fields in OpenAI request adapters.
- Add reusable provider reference registration state keyed by content hash.
- Add local result-cache validation, atomic writes, force, and revalidate modes.
- Reject incomplete text and malformed image responses before artifact writes.
- Verify using provider fakes and JSONL fixtures only.

## Stage 5: operator surface and observability

- Extend the existing image and story batch commands with inspectable cache,
  grouping, dependency, force, and revalidation behavior.
- Preserve per-item success on partial/expired batches and emit retry-only plans.
- Add aggregate prompt-cache metrics and safe debug records.
- Verify CLI handlers in simulation mode; do not submit paid batches.

## Stage 6: quality, documentation, and migration

- Extend deterministic story and image quality gates and targeted repair routing.
- Document configuration, two-phase workflows, cache semantics, partial failure,
  retry/resume, and safe simulation.
- Publish the architecture/root-cause report and required implementation reports.
- Run focused tests, affected package typechecks, targeted lint, and JSONL/path
  checks within repository verification limits.

## Delivery boundary

The first implementation increment will make the cache/dependency contracts and
planning behavior production-usable while retaining manifest compatibility. Paid
submission and provider file-expiry verification remain operator-controlled.
