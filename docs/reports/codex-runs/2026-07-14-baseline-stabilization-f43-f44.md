# Baseline stabilization: F43-F44

## Changed files

- `packages/story-localization/src/story-localization.unit.test.ts`
- `docs/refactor/audit/README.md`

## Tests/checks run and results

- `pnpm test:focused -- packages/story-localization/src/story-localization.unit.test.ts`: F43 and F44 pass; 21 passed, 1 failed, 1 todo before bail after two repair reruns.

## Risks remaining

- F45 begins with an old English response shape, so the Spanish incomplete response is consumed as English validation repair.

## Follow-up tasks

- Convert F45’s English and Spanish raw responses to the shared v4 fixture, then continue F46-F49.
