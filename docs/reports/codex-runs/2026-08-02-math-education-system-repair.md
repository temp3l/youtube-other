# Math education system repair

Date: 2026-08-02  
Base commit: `2029f3f` (no commit created)

## Changed files

- `packages/math-education/src/{domain,lesson,localization,orchestration}`: branded content boundaries, categorical invariants, grade profiles, tally compiler, semantic quality, cache/revalidation planning.
- `packages/math-rendering/src/quality`: opt-in scene/fact synchronization.
- `packages/speech/src`: versioned German numeric verbalizer and provider/cache integration.
- `apps/cli/src/math-commands.ts`: inspect, validate, quality, diff, failure, and regeneration dry-run commands.
- `docs/decisions/ADR-MATH-001-*`, `docs/mathe/{architecture,audits,samples}`, `docs/mathe/README.md`: evidence, contracts, migration, and generated sample.

## Tests/checks

- Math unit contracts: 23 passed.
- Localization/quality: 16 passed.
- Data-diagram integration: 1 passed.
- Speech/platform: 32 passed.
- Typecheck: math-education, math-rendering, speech, CLI passed.
- Targeted ESLint and `git diff --check`: passed.
- CLI quality report: passed, score 100, no warnings/blockers.

## Risks/follow-up

No private artifact inventory, timed subtitle/render E2E, API/batch consolidation, metrics wiring, locale-specific objective rules beyond German, or grades 6–10 golden lessons were completed. Regeneration remains dry-run only. No non-math artifacts were changed or regenerated.
