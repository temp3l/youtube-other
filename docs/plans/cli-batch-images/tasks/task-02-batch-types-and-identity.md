# Task 02 - Batch Types And Stable Identity

Recommended model: GPT-5.4 for schema design and compatibility review; GPT-5.4-mini for TypeScript refactors once the schema is chosen.

Commit after implementation: `feat(image-batch): add stable multi-variant asset identity`

## Objective

Generalize image batch types from English/full scene-only items to deterministic asset identities that support language, variant, asset role, operation, and dependency hashes.

## Background

`image-batch.types.ts` and `image-batch.schemas.ts` currently use `language: "en"` and `format: "full"` literals. `custom_id` includes episode, `en`, `full`, scene ID, and hashes, but not asset role or dependency version.

## Scope

- Add a stable image asset identity type.
- Support roles: full scene, short scene, character reference, location reference, object/prop reference, reusable continuity asset, and thumbnail only if already in the image pipeline.
- Include operation: image generation, image edit, or deterministic transform.
- Include language, variant, scene/shot ID where applicable, model, size, quality, prompt hash, and reference dependency hashes.
- Keep old manifests readable through normalization where feasible.

## Out of scope

- No CLI commands.
- No provider submission changes beyond type compatibility.
- No short strategy behavior changes.

## Dependencies

Task 01.

## Repository evidence

- `packages/image-generation/src/image-batch.types.ts`
- `packages/image-generation/src/image-batch.schemas.ts`
- `packages/image-generation/src/image-batch-planner.ts`
- `packages/shared/src/episode-filesystem.ts`

## Required changes

- Replace literal-only language/format fields with normalized language and variant fields.
- Add `assetRole`, `operation`, `identityHash`, and `dependencyHashes`.
- Update `buildCustomId` to derive from canonical identity fields, not array position.
- Ensure deterministic ordering by identity.

## Data model or manifest changes

Introduce manifest schema version `image-batch-v2` or a compatible versioned normalizer. Preserve reading of `image-batch-v1` for existing batches.

## CLI behavior

No CLI behavior changes yet.

## Error handling and observability

Add validation errors for missing identity fields, duplicate `custom_id`, duplicate destination paths, and unsupported operation/endpoint pairs.

## Security and cost controls

Identity must prevent duplicate paid requests by detecting equivalent prepared items before submission.

## Tests

- Stable identity for full scene, localized full scene, short scene, and reference asset.
- Deterministic custom IDs across repeated preparation.
- Duplicate identity and duplicate destination path rejection.
- Backward-compatible parsing for v1 manifests.

## Verification commands

```bash
pnpm test:focused -- packages/image-generation/src/image-batch-planner.unit.test.ts
pnpm test:focused -- packages/image-generation/src/image-batch-service.unit.test.ts
```

## Acceptance criteria

- Batch identity no longer depends on English/full literals.
- Existing v1 tests either pass unchanged or are intentionally updated.
- Every request item has a stable identity and destination path.

## Rollback considerations

Keep v1 normalization isolated so rollback can restore the previous schema without modifying episode assets.
