# Task 03 - Reference Asset Stages

Recommended model: GPT-5.4 for endpoint and dependency modeling; GPT-5.4-mini for focused implementation once request shapes are pinned.

Commit after implementation: `feat(image-batch): stage reference assets before scenes`

## Objective

Model reference images as first-class staged batch assets and ensure dependent scene requests cannot be prepared before required references exist or are explicitly allowed.

## Background

Synchronous scene generation loads approved character references and uses image edit semantics when references are present. The batch planner currently tracks reference hashes but emits text-only generation requests.

## Scope

- Add reference asset planning for character references.
- Add extension points for location, object/prop, and reusable continuity assets.
- Add staged dependency ordering: reference prompts, reference images, scene prompts, scene images.
- Enforce approval or explicit unapproved-reference allowance before dependent scenes.
- Validate endpoint choice for text-only generation versus reference-assisted edit.

## Out of scope

- No legacy reference workflow revival.
- No location/object generation unless existing source data can support it.
- No thumbnails unless already connected to the current image-generation pipeline.

## Dependencies

Task 02.

## Repository evidence

- `packages/image-generation/src/episode-image-pipeline.ts`
- `packages/image-generation/src/image-batch-planner.ts`
- `packages/image-generation/src/thumbnail-image-generator.ts`
- `packages/image-generation/src/thumbnail-reference-resolver.ts`

## Required changes

- Add a reference-stage planner that reuses existing character registry and prompt generation.
- Add dependency hashes to scene items from referenced assets.
- Refuse to prepare a reference-assisted scene batch if the request would drop image inputs.
- If `/v1/images/edits` batch request input images are implemented, verify JSONL schema with SDK types and existing repository request conventions.

## Data model or manifest changes

Add dependency entries per item: asset identity, source path, SHA-256, approval status, and dependency role.

## CLI behavior

No public CLI yet, but planner APIs must expose reference stages for Task 05.

## Error handling and observability

Emit structured errors for missing reference image, unapproved reference, unsupported edit batch request, and stale dependency hash.

## Security and cost controls

Do not submit dependent scene requests when reference stages are incomplete. Include request count previews per stage.

## Tests

- Character reference stage precedes dependent scene stage.
- Scene preparation fails if a required approved reference is missing.
- Reference-assisted scenes never silently fall back to text-only generation.
- Text-only scenes still use `/v1/images/generations`.

## Verification commands

```bash
pnpm test:focused -- packages/image-generation/src/image-batch-planner.unit.test.ts
pnpm test:focused -- packages/image-generation/src/episode-image-pipeline.unit.test.ts
```

## Acceptance criteria

- Reference assets are represented in batch planning.
- Dependent scenes include reference dependency hashes.
- Unsupported reference-assisted batch requests fail before submission.

## Rollback considerations

Keep staged planning additive. Rollback should leave synchronous reference generation intact.
