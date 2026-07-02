# Task 08: Migrate Repository-Owned Episodes

## Objective

Move authored scripts to canonical locations once the migration dry run is reviewed.

## Background

The plan selects `languages/script-<language>.md` and `languages/short/script-<language>.md`.

## Scope

Only repository-owned episode scripts. Generated artifacts stay unless explicitly reclassified.

## Expected files

- `episodes/**/languages/**`
- migration report artifacts under docs or temporary output

## Procedure

1. Run dry-run inventory.
2. Review divergent files.
3. Resolve manual conflicts.
4. Run write mode for safe moves.
5. Remove compatibility copies only after consumers no longer read them.

## Safety constraints

No production-data deletion. No generated output cleanup in this task.

## Validation

```bash
pnpm test:focused -- packages/shared/src/episode-filesystem.unit.test.ts
```

## Completion checklist

- [ ] 022 en/de canonical scripts resolve
- [ ] no unresolved collisions
- [ ] migration report committed

## Dependencies

Task 07 and human review.

## Batching

Keep isolated.
