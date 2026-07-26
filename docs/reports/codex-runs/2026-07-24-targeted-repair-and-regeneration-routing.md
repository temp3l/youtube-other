# Targeted Repair And Regeneration Routing

## Summary

Task 07 adds typed local/architecture affect issue codes, evidence-gated
beat/beat-range routing, deterministic-first blocking, bounded retry decisions,
locked repair instructions, complete-contract post-repair validation, stable
routing/prompt fingerprints, and lineage-ready attempt records. Existing Short
repair prompts consume the optional locked fragment; no default provider call or
loop was added.

## Changed Paths

- Story generation contracts, Analysis V2 schema/service, retry routing,
  quality repair, Short repair prompt, package export, and focused tests under
  `packages/story-localization/src/`
- `docs/architecture/story-localization.md`
- Required Task 07 reports

## Checks

- Retry routing focused: 21 passed.
- Exact Task 07 analysis/repair/prompt group: initially 2 passed, 1 fixture
  failed; corrected projection field, rerun 3 passed.
- Exact mocked Short service repair: 1 passed.
- Story-localization typecheck: passed, verifying Tasks 05–07.

## Risks / Incomplete / Deviations

No live provider, analytics, fixture regeneration, generated assets, or Task 08.
One permitted fixture-only rerun was used. Production invocation remains
operator/workflow-selected; default generation behavior is unchanged.

## Commit

`f29a43c` (changes uncommitted).
