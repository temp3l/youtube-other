# Task 16: Persistence, Cache, Resume, And Invalidation Plan

## 1. Scope And Non-Goals

Scope:

- Implement versioned persistence and dependency-aware invalidation for full and short artifacts.
- Normalize logical artifact identity as `<language>/<variant>/<artifact-owner>` while adapting physical layout to existing conventions.
- Make resume variant-safe and parent-lineage-aware.
- Preserve compatibility paths and readers.

Non-goals:

- Do not redesign Tasks 08-10 artifact schemas before verifying their merged shape.
- Do not replace prompt compiler, validation, routing, cost, or media-stage ownership from Tasks 11-15.
- Do not change public CLI commands, external artifact paths, provider routing, or `.env` precedence.
- Do not make paid API calls.

## 2. Confirmed Repository Findings

- `story-localization-cache.ts` owns current cache directories, cache entries, facts cache, output file resolution, and configuration hashing.
- `canonical-full-story.persistence.ts` owns canonical English full artifact and manifest schemas, canonical paths, fingerprints, compatibility Markdown, and resume helpers.
- `short-rewrite.persistence.ts` owns current short manifest and artifact writes with file locking.
- `short-rewrite.types.ts` and `short-rewrite.schemas.ts` currently use schema version `1` and English-source-oriented fields.
- `story-localization-batch-storage.ts` provides file-lock helpers used by batch and short persistence.
- `story-localization-batch-service.ts` persists batch manifests, cache entries, retry lineage, and canonical full manifests.

## 3. Dependencies And Assumptions From Tasks 08-10

- Task 08 finalizes localized full artifact identity, parent canonical English full hash, locale validation, and localized full manifests.
- Task 09 finalizes short-source extraction, short contract, parent full-story hash, StoryIR hash, and contract hash.
- Task 10 finalizes short prompt compiler/generation artifact schemas, prompt hash, model config, usage, validation, repair history, and status.
- Treat all Tasks 08-10 paths and fields as provisional until verified after merge.

## 4. Target Architecture And Ownership

- Task 16 owns cache keys, persistence manifest fields, compatibility readers, resume validation, and invalidation rules.
- Artifact identity is logical: language, locale, variant, and artifact owner.
- Physical layout keeps existing compatibility paths such as root `script.md`, `en/full/script.md`, localized `full/script.md`, and localized `short/script.md`.
- Every short artifact persists language, locale, variant, parent full-story hash, StoryIR hash, short-contract hash, compiler version, prompt hash, model config, usage, cost, validation, repair history, and status.

## 5. File-By-File Change Plan

- `packages/story-localization/src/story-localization-cache.ts`: extend cache key inputs to include variant, owner, locale, parent hash, prompt/schema/compiler versions, and status compatibility.
- `packages/story-localization/src/canonical-full-story.persistence.ts`: align canonical full manifest fields with Task 16 invalidation matrix without breaking existing readers.
- `packages/story-localization/src/short-rewrite.persistence.ts`: add versioned short artifact/manifest readers and writers after Task 10 schema verification.
- `packages/story-localization/src/short-rewrite.schemas.ts` and `short-rewrite.types.ts`: extend final Task 10 schema additively for lineage and cache/resume fields.
- `packages/story-localization/src/story-localization.service.ts`: reject stale full/localized full artifacts on resume.
- `packages/story-localization/src/short-rewrite.service.ts`: reject stale shorts when parent full hash, StoryIR hash, contract hash, prompt hash, schema, or compiler version changes.
- `packages/story-localization/src/story-localization-batch-service.ts`: apply the same cache and stale-artifact checks in batch import/retry paths.

## 6. Compatibility And Migration

- Existing compatibility paths remain readable and writable where current commands require them.
- Failed artifacts are preserved as failed outputs but never reused as successful outputs.
- Artifacts without new lineage fields are treated as legacy compatibility reads, not fresh cache hits.
- Schema or compiler incompatibility blocks resume and requires regeneration of affected artifacts only.

## 7. Tests And Verification Commands

- `pnpm test:unit -- packages/story-localization/src/story-localization.unit.test.ts`
- `pnpm test:unit -- packages/story-localization/src/short-rewrite.service.unit.test.ts`
- `pnpm test:unit -- packages/story-localization/src/short-rewrite.unit.test.ts`
- `pnpm test:unit -- packages/story-localization/src/full-rewrite.resolution.unit.test.ts`
- `pnpm test:unit -- packages/story-localization/src/story-localization.batch.integration.test.ts`

## 8. Ordered Implementation Steps

1. Verify final Tasks 08-15 fields, status enums, paths, fingerprints, hashes, and issue codes.
2. Define code-level invalidation matrix using existing hash and fingerprint owners.
3. Extend cache key builders to include variant, owner, locale, parent hash, and prompt/schema/compiler dimensions.
4. Add compatibility readers for legacy artifacts and manifests.
5. Implement stale full rejection for StoryIR, prompt, schema, compiler, and source lineage changes.
6. Implement stale short rejection for parent full hash, StoryIR hash, short-contract hash, prompt, schema, compiler, and model config changes.
7. Implement locale isolation so a locale failure does not invalidate other locales.
8. Add concurrent manifest write tests using existing file-lock helpers.

## 9. Risks

- Overly broad invalidation can cause expensive regeneration; use the exact dependency matrix and owner-specific fingerprints.
- Under-invalidation can reuse stale shorts after parent full changes; parent hash checks are mandatory.
- Legacy path readers can mask stale artifacts; legacy reads must not become fresh cache hits without required fields.

## 10. Acceptance Criteria

- Resume is dependency-aware and variant-safe.
- Compatibility paths exist where needed.
- Cache keys and manifests include variant and parent lineage.
- A short whose parent full hash changed is never reused.
- Failed artifacts are never treated as successful outputs.

## 11. Post-Task-10 Verification Checklist

- Confirm final canonical full, localized full, canonical short, and localized short artifact paths.
- Confirm final manifest names and schema versions.
- Confirm final parent hash, StoryIR hash, contract hash, prompt hash, compiler version, schema version, model config, usage, cost, validation, repair history, and status fields.
- Confirm final compatibility readers for legacy full and short Markdown.
- Confirm final batch manifest fields and retry lineage behavior.
