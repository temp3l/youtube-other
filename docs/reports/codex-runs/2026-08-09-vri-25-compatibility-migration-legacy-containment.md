# VRI-25 Compatibility migration and legacy-path containment

Date: 2026-08-09

## Changed files

- `packages/shared/src/artifact-path-resolver.ts`
- `packages/shared/src/artifact-path-resolver.unit.test.ts`

## Implemented

- Bumped the versioned artifact resolver policy to v2.
- Kept Veronica writes canonical under `veronicabenini` and nested immutable source paths.
- Added fixed-order, read-only legacy discovery for flat strategic source originals and source manifests.
- Confirmed the existing CLI workflow writer already parses the strategic alias to canonical `veronicabenini`; no direct legacy writer was changed.

## Checks

- `pnpm test:focused -- packages/shared/src/artifact-path-resolver.unit.test.ts` — passed (6 tests).
- `git diff --check` — passed.

## Risks and follow-up

Legacy candidates are discovery-only; workflow artifact verification still requires a valid manifest and never treats an unmanifested legacy file as a cache hit. Provider dispatch remains unenabled.
