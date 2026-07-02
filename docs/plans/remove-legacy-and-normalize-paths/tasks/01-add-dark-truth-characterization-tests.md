# Task 01: Add Dark Truth Characterization Tests

## Objective

Protect active Dark Truth full-video and Short behavior before deleting legacy code.

## Background

Active behavior is spread across `apps/cli`, `@mediaforge/story-localization`, `@mediaforge/speech`, `@mediaforge/image-generation`, `@mediaforge/rendering`, and `@mediaforge/metadata`. Existing tests also preserve legacy assumptions.

## Scope

Add focused tests for active command registration, application setup, full/Short setup, multilingual script handling, cache isolation, and legacy entry-point characterization.

## Expected files

- `apps/cli/src/*.unit.test.ts`
- `packages/story-localization/src/*.unit.test.ts`
- `packages/speech/src/*.unit.test.ts`
- `packages/shared/src/episode-filesystem.unit.test.ts`

## Procedure

1. Add tests that capture current active commands and outputs.
2. Add fixtures for episode 022 English and German canonical paths.
3. Add tests that document current failure or ambiguity where behavior is unsafe.
4. Do not weaken existing assertions.

## Safety constraints

No production source removal. No paid API calls. Use mocks and dry-run paths.

## Validation

```bash
pnpm test:focused -- apps/cli/src/story-full-rewrite-command.unit.test.ts
pnpm test:focused -- apps/cli/src/story-short-rewrite-command.unit.test.ts
pnpm test:focused -- packages/shared/src/episode-filesystem.unit.test.ts
```

## Completion checklist

- [ ] full pipeline setup characterized
- [ ] Short setup characterized
- [ ] 022 en/de examples covered
- [ ] legacy assumptions documented as tests

## Dependencies

None.

## Batching

Do not batch with code deletion.
