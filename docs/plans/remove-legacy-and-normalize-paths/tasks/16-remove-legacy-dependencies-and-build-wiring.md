# Task 16: Remove Legacy Dependencies And Build Wiring

## Objective

Clean package manifests, lockfile, exports, and build references.

## Background

`apps/cli` and `apps/api` depend on `@mediaforge/pipeline`.

## Scope

Workspace package manifests, lockfile, TS references, package exports.

## Expected files

- `package.json`
- `pnpm-lock.yaml`
- `apps/*/package.json`
- `packages/*/package.json`
- `tsconfig*.json`

## Procedure

1. Remove workspace deps only after imports are gone.
2. Run `pnpm install --lockfile-only` if lockfile needs update.
3. Remove build/test references to deleted packages.

## Safety constraints

Do not update unrelated dependency versions.

## Validation

```bash
rg "@mediaforge/pipeline" package.json apps packages pnpm-lock.yaml
pnpm --filter @mediaforge/cli typecheck
pnpm --filter @mediaforge/api typecheck
```

## Completion checklist

- [ ] manifests clean
- [ ] lockfile clean
- [ ] build order clean

## Dependencies

Task 10.

## Batching

Can batch with final pipeline deletion.
