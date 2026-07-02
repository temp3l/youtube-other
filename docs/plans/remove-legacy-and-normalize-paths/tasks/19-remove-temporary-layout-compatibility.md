# Task 19: Remove Temporary Layout Compatibility

## Objective

Remove transitional compatibility reads and writes after migration.

## Background

Compatibility behavior is useful during implementation but must not remain indefinitely.

## Scope

Root script reads/writes, `<lang>/<variant>/script.md` source reads, old audio/image fallbacks.

## Expected files

- resolver module
- story-localization resolution modules
- speech/script modules
- CLI helpers

## Procedure

1. Confirm all active consumers use canonical resolver.
2. Remove compatibility candidate arrays.
3. Change ambiguity diagnostics to stale-layout errors.
4. Update tests to assert compatibility absence.

## Safety constraints

Do not remove generated output readers that are not script-source readers.

## Validation

```bash
rg "script.md|en/full/script.md|en/script.md|audio/script-source" apps packages
pnpm test:focused -- packages/shared/src/episode-filesystem.unit.test.ts
```

## Completion checklist

- [ ] no root script compatibility source
- [ ] no silent fallback
- [ ] stale layouts fail clearly

## Dependencies

Tasks 08 and 17.

## Batching

Keep isolated.
