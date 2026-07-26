# Short Affect-Plan Projection

## Summary

Task 04 adds a versioned, source-grounded canonical-English Short projection with
one question, rule, proof/response, cost, and accepted payoff. Enforce mode embeds
it in the existing Short adaptation contract, prompt, cache identity, sidecar,
repair, and regeneration paths. Off/shadow identity remains unchanged; localized
affect preservation was not started.

## Changed Paths

- `packages/story-localization/src/short-horror-affect-projection{,.unit.test}.ts`
- Short contract/types/schemas, prompt/compiler/modules, service/tests, exports
- `apps/cli/src/story-short-rewrite-command.ts`
- Story-localization/config docs and required reports

## Checks

- Projection focused test: 5 passed.
- Full Short helper: stopped on pre-existing German-heading assertion.
- Exact new prompt/service filter: prompt and off/shadow passed; enforce persistence
  reached an existing hook-repair route and exhausted its mock. Final fixture-only
  hook correction was not rerun after the retry limit.
- Story-localization typecheck: passed after one exact-optional fix.
- Targeted `git diff --check`: passed.

## Risks

Enforce persistence/resume service cases need a fresh focused rerun. No live
provider, analytics, or generated-asset call occurred.

## Commit

`30bc2c8` (uncommitted).
