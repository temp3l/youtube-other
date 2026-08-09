# VRI-01 canonical Veronica identity

## Changed files

- `packages/domain/src/workflow-contracts.ts`
- `packages/domain/src/content-policy-contracts.ts`
- `packages/config/src/content-policy-registry.ts`
- `packages/strategic-reinvention/src/profile.ts`
- Corresponding focused unit tests
- Implementation checkpoint and this report

## Tests/checks

- Four-file focused Vitest run: 16 tests passed; profile suite initially could not resolve unbuilt workspace packages.
- `pnpm --filter @mediaforge/domain typecheck`: passed.
- `pnpm test:focused -- packages/strategic-reinvention/src/profile.unit.test.ts`: 2 tests passed after local package builds.
- `git diff --check` on owned paths: passed.

## Result and risks

Legacy `strategic-reinvention` inputs now normalize to canonical `veronicabenini` identity at shared contract and registry boundaries. Existing package/file names remain compatibility aliases. Production activation, paid providers, and publishing remain disabled. Later compatibility work must migrate legacy on-disk path resolution without rewriting immutable history.

## Follow-up

Execute VRI-02, VRI-03, and VRI-04 after the identity checkpoint.
