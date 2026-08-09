# VRI-15 delivery bundles

## Changed files

- `packages/metadata/src/delivery-bundle.ts`, `packages/metadata/src/index.ts`, and `packages/metadata/package.json`
- `packages/veronica-media/src/delivery/delivery-bundle.ts`, `packages/veronica-media/src/index.ts`, and `packages/veronica-media/package.json`
- Focused unit tests beside both contracts.

## Checks run

- `pnpm test:focused -- packages/metadata/src/delivery-bundle.unit.test.ts` — passed (2 tests).
- `pnpm test:focused -- packages/veronica-media/src/delivery/delivery-bundle.unit.test.ts` — passed (2 tests; first attempt exposed the missing metadata subpath export, then passed after the scoped export was added).
- `pnpm --filter @mediaforge/metadata build` — blocked by pre-existing unbuilt workspace dependencies: `@mediaforge/process-runner` and `@mediaforge/observability` cannot be resolved.
- `git diff --check` — passed.

## Result and risks

The shared contract produces immutable, revision/configuration/dependency-bound manifests with editable locale metadata, distinct revision-bound delivery approvals, cache reuse, contained relative delivery paths, redacted failures, and explicit non-dispatch/non-publication state. The Veronica adapter rejects invented or stale approval evidence, accepts matching locale/render lineage, and leaves visuals untouched for metadata edits. External dispatch and publication remain intentionally disabled; the full metadata package build requires its existing workspace build prerequisites.
