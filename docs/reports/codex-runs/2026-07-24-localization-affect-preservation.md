# Localization Affect Preservation

## Summary

Task 05 adds a versioned localized-full projection of accepted question, rule,
response, cost, climax, payoff, protected-fact, and parent-plan IDs. Enforce
mode compiles evidence-bearing semantic invariants through the existing sync and
batch localization path; off/shadow request, schema, fingerprint, and cache
identity remain unchanged.

## Changed Paths

- `packages/story-localization/src/localization-horror-affect-projection{,.unit.test}.ts`
- Localization prompt/compiler/modules/response schemas, fidelity/tests,
  sync/batch services, manifest/types/cache/tests, and exports
- `docs/{architecture/story-localization,development/configuration}.md`
- Required implementation/run reports

## Tests

- Projection focused: 5 passed.
- Fidelity focused: 10 passed.
- Exact sync/batch, cache, final-line, Unicode, rename-map, and final-consequence
  filter: 6 passed.
- Story-localization typecheck: initial 4 errors; two repair reruns reduced this
  to one exact-optional batch evidence error. Final explicit typed extraction
  was not rerun after the retry budget.
- Targeted Prettier check found 12 touched files; targeted formatting completed.
- `git diff --check`: passed.

## Commit

`30bc2c8` (changes uncommitted).

## Unresolved Risks

The final typecheck fix is unverified. Evidence is structured and deterministic;
qualitative semantic scoring remains Task 06. No provider or analytics call ran.
