# Task 06: Update Cache And Artifact Identity

## Objective

Prevent collisions after path normalization.

## Background

Path changes affect story, short, narration, metadata, image, render, and resume caches.

## Scope

Include resolver identity in active cache keys and manifests.

## Expected files

- `packages/story-localization/src/*cache*`
- `packages/speech/src/narration-*`
- `packages/metadata/src/youtube-metadata.ts`
- `packages/rendering/src/*`
- `packages/image-generation/src/*`

## Procedure

1. Add episode, language, variant, relative script path, content hash, resolver version.
2. Keep old cache reads conservative: miss or stale, never unsafe hit.
3. Update manifests with migration-compatible schema additions.

## Safety constraints

Do not delete old caches automatically.

## Validation

```bash
pnpm test:focused -- packages/metadata/src/youtube-metadata.unit.test.ts
pnpm test:focused -- packages/speech/src/narration-cache.unit.test.ts
```

## Completion checklist

- [ ] language isolation
- [ ] variant isolation
- [ ] stale old cache behavior

## Dependencies

Task 03.

## Batching

Split by owner package.
