# Controlled Evaluation, Rollout, And Final Audit

## Summary

Task 08 adds immutable preregistration, separate seeded full/Short blind packets,
non-secret rater provenance, authorized aggregate audience imports, retention
metrics, exploratory-strata labels, all-gate decisions, approval binding, and
configuration-only transitions. The source-backed audit and current versioned
records fail closed to `remain-shadow`.

## Changed Paths

- `packages/story-localization/src/horror-evaluation-rollout{,.unit.test}.ts`
  and package exports
- `docs/development/horror-controlled-evaluation/`
- Story-localization/config docs, docs index, and final contract audit
- Required implementation/run reports

## Checks

- Manifest/assignment filter: 3 passed.
- Metric/decision/approval/rollback filter: 3 passed.
- Full focused Task 08 file: 7 passed.
- Story-localization typecheck: passed.
- Targeted `git diff --check`: passed.

## Risks / Incomplete / Deviations

The v2 manifest now freezes a production cohort, metric, threshold, USD 8 /
8-call ceiling, and functional authorities. No production candidates, human
comparison, audience import, or rollout approval exists. No provider, YouTube,
upload, publication, fixture regeneration, or generated-asset action ran. Task
03 remains synthetic. Task 04 persistence/resume cases pass.

## Commit

`f29a43c` (changes uncommitted).
