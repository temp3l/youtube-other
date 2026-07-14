# Baseline stabilization: Short parent contract

## Changed files

- `packages/story-localization/src/narration-constraints.unit.test.ts`
- `packages/story-localization/src/short-rewrite.service.unit.test.ts`
- `packages/story-localization/src/generated-story-validator.ts`
- `packages/story-localization/src/generated-story-validator.unit.test.ts`
- `docs/refactor/audit/README.md`

## Tests/checks run and results

- `pnpm test:focused -- packages/story-localization/src/narration-constraints.unit.test.ts`: 3/3 passed after updating F25.
- `pnpm test:focused -- packages/story-localization/src/generated-story-validator.unit.test.ts`: 27/27 passed.
- `pnpm test:focused -- packages/story-localization/src/short-rewrite.service.unit.test.ts`: stopped after two targeted repairs; 1/17 passed before bail. The first remaining test reaches current quality validation and exhausts its one-response mock.

## Risks remaining

- F26-F39 still require a current-quality shared narration fixture. The exact remaining issues are missing impossible hook, observable-action density, and emotionally costly decision.

## Follow-up tasks

- Repair the shared narration fixture, rerun the Short service file, then continue F40-F54.
