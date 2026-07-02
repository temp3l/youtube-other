# Task 02: Define Canonical Episode Domain Types

## Objective

Create shared typed concepts for episode slug, language, script variant, absolute path, relative path, and script content hash.

## Background

`packages/shared/src/episode-filesystem.ts` already has episode id, locale, variant, relative path, and containment helpers. Reuse these conventions.

## Scope

Add or refine type exports without changing runtime behavior.

## Expected files

- `packages/shared/src/episode-filesystem.ts`
- `packages/shared/src/index.ts`
- `packages/shared/src/episode-filesystem.unit.test.ts`

## Procedure

1. Reuse `normalizeEpisodeId`, `normalizeLocaleCode`, and `normalizeContentVariant`.
2. Add branded aliases only where they improve clarity.
3. Reject legacy Spanish `sp`.
4. Export types through `packages/shared/src/index.ts`.

## Safety constraints

Do not rename public types until consumers are updated.

## Validation

```bash
pnpm test:focused -- packages/shared/src/episode-filesystem.unit.test.ts
pnpm --filter @mediaforge/shared typecheck
```

## Completion checklist

- [ ] slug/language/variant validation covered
- [ ] path brands exported
- [ ] no duplicate domain model invented

## Dependencies

Task 01.

## Batching

Can batch with Task 03 if tests stay focused.
