# VRI-03 — Mixed-source ingestion and canonical manifests

## Objective

Use shared manifests for mixed assets, extraction, policy, dedupe, and source-to-output lineage.

## Priority

P0

## Stories covered

VER-010 (PARTIAL), VER-011 (PARTIAL), VER-012 (ABSENT), VER-013 (PARTIAL), VER-014 (PARTIAL), VER-015 (PARTIAL)

## Existing implementation/evidence

`persistContentSourceManifest` and `ingestSupplementalMediaAsset` provide secure hashed foundations.

## Required changes

- Extend shared capability → policy/configuration → Veronica adapter; do not create a parallel subsystem.
- Persist revision-bound, versioned artifacts with provenance, effective configuration, and dependency identity.
- Preserve valid approved/cache-compatible artifacts; fail closed before paid or irreversible work.

## Explicit non-goals

- No production-provider dispatch, live publication, or source-original mutation.
- No Veronica-specific cache, workflow, approval, renderer, or publisher copy.
- No unrelated legacy cleanup.

## Likely files/modules

packages/source-ingestion/src/content-source.ts; packages/veronica-media/src/ingestion/secure-ingest.ts; packages/veronica-media/src/contracts/media-plan.v1.ts

## Data/schema impact

Strict versioned contracts only. Normalize the alias to `veronicabenini` before persisted identity/fingerprint construction.

## API/contract impact

Add only stable typed interfaces. API and CLI call the same workflow/capability service; retriable mutation requires authorization and idempotency.

## Dependencies

VRI-01

## Parallel-safety classification

**SAFE_PARALLEL**.

## Shared-file ownership

**EXCLUSIVE_WRITE_OWNER:** source manifest/extraction adapters. Other tasks must use additive/disjoint files or wait for this owner.

## Acceptance criteria

- Satisfy the referenced source-story acceptance criteria through the canonical path.
- Record lineage, revision/configuration identity, and reuse/regeneration rationale.
- Do not invalidate language-independent visuals solely for localization.
- Preserve immutable approved history and actionable, redacted failure evidence.

## Affected-scope validation

- Focused unit tests beside the changed service/contract.
- `pnpm test:focused -- <affected-test-file>`.
- One bounded integration/contract/render-fixture test only when crossing a boundary; no repository-wide validation.

## Risks

Alias migration, legacy artifact ambiguity, and cross-owner schema edits can create competing authority; stop at the stated merge barrier.

## Completion evidence

Focused test result, artifact/contract fixture, and required Codex run report; document any unenabled external activation gate.
