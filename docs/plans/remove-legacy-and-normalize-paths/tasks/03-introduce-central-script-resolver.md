# Task 03: Introduce Central Script Resolver

## Objective

Implement one resolver for authored episode scripts.

## Background

Current consumers independently search root `script.md`, `en/full/script.md`, `en/script.md`, and language folders. This causes ambiguity.

## Scope

Add resolver request/result/error types and deterministic lookup.

## Expected files

- `packages/shared/src/episode-filesystem.ts` or a new shared resolver module
- `packages/shared/src/index.ts`
- resolver unit test file

## Procedure

1. Resolve full scripts to `languages/script-<language>.md`.
2. Resolve Short scripts to `languages/short/script-<language>.md`.
3. Validate slug, language, variant, containment, file existence, and file type.
4. Scan known noncanonical candidates and throw ambiguity when conflicts exist.
5. Return absolute path, relative path, content hash, cache identity, and log context.

## Safety constraints

No silent fallback. No compatibility copy creation. No English default.

## Validation

```bash
pnpm test:focused -- packages/shared/src/episode-filesystem.unit.test.ts
pnpm --filter @mediaforge/shared typecheck
```

## Completion checklist

- [ ] missing file errors
- [ ] ambiguity errors
- [ ] traversal rejection
- [ ] 022 English and German paths pass

## Dependencies

Tasks 01 and 02.

## Batching

Can batch with Task 02.
