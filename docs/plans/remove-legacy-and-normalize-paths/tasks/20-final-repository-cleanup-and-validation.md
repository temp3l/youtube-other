# Task 20: Final Repository Cleanup And Validation

## Objective

Prove the repository has no unexplained legacy references and active Dark Truth flows remain valid.

## Background

This is the final gate before merge.

## Scope

Repository-wide searches, focused validation, docs report, release notes.

## Expected files

- final cleanup report
- release notes or migration notes if required

## Procedure

1. Run mandatory stale-reference searches.
2. Classify every remaining match.
3. Run focused unit tests and affected package typechecks.
4. Run migration dry-run validation.
5. Validate 022 English and German setup through full and Short dry-run stages where applicable.

## Safety constraints

Do not run broad tests/builds unless authorized.

## Validation

```bash
rg "script.md|en/full/script.md|de/full/script.md|@mediaforge/pipeline|createPipeline|legacy" .
pnpm test:focused -- packages/shared/src/episode-filesystem.unit.test.ts
pnpm test:focused -- apps/cli/src/index.unit.test.ts
pnpm --filter @mediaforge/cli typecheck
```

## Completion checklist

- [ ] all stale refs classified
- [ ] focused validation passes
- [ ] no paid API calls required
- [ ] release notes complete
- [ ] rollback notes complete

## Dependencies

All prior tasks.

## Batching

Final gate only; do not batch with feature changes.
