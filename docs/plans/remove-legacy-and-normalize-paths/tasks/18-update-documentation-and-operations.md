# Task 18: Update Documentation And Operations

## Objective

Make repository docs describe only active Dark Truth architecture and canonical paths.

## Background

Docs currently describe root `script.md` as canonical in some files.

## Scope

Relevant docs, runbooks, examples, environment templates, diagrams.

## Expected files

- `docs/cli.md`
- `docs/architecture/*.md`
- `docs/development/*.md`
- `.env.example`

## Procedure

1. Replace canonical path references.
2. Remove legacy command docs.
3. Document resolver, migration utility, supported CLI, rollback policy, and manual data cleanup.
4. Re-render diagrams only if source diagrams changed and authorized.

## Safety constraints

Do not load or update unrelated docs.

## Validation

```bash
rg "script.md|en/full/script.md|@mediaforge/pipeline|createPipeline|legacy" docs .env.example
```

## Completion checklist

- [ ] canonical layout documented
- [ ] old commands removed
- [ ] unresolved historical refs classified

## Dependencies

Tasks 09 through 16.

## Batching

Can batch with final stale search.
