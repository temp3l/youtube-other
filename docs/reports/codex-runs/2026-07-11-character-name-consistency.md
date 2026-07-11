# Character Name Consistency

## Changed files

- `packages/story-localization/src/canonical-facts.service.ts`
- `packages/story-localization/src/short-rewrite.prompt.ts`
- `packages/story-localization/src/short-rewrite.service.ts`
- `packages/story-localization/src/story-quality-repair.ts`
- `packages/story-localization/src/story-quality-repair.unit.test.ts`
- `packages/story-localization/src/story-quality-gate.unit.test.ts`

## Summary

Short generation and repair now reuse the authoritative character rename map. Structured prompts fail when that map is absent, compatibility generation prefers a persisted canonical map, and generic facts/repair logic no longer contains story-specific `Adrian` rules.

## Tests and checks

- `pnpm test:focused -- packages/story-localization/src/story-quality-repair.unit.test.ts packages/story-localization/src/story-quality-gate.unit.test.ts`: passed, 11 tests.
- `pnpm --filter @mediaforge/story-localization typecheck`: passed.
- Scoped `git diff --check`: passed before final report creation.

## Risks and follow-up

- Legacy string-only prompt callers still create a deterministic map because they have no canonical artifact context.
- No provider-backed generation was run.
