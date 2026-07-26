# Short Affect Enforce Follow-up

## Summary

The Task 04 follow-up fixed fictional-name false positives, renamed canonical
quality facts, enforced-projection quality-fact ownership, burn-based emotional
cost recognition, and stale affect fixtures. The resume-identity case passed.
The enforce-persistence case still enters repair because the quality gate
requires the supernatural-rule fact as an exact substring instead of accepting
the narration's equivalent “each time ... appeared closer” wording.

## Changed Paths

- `packages/story-localization/src/{generated-story-validator,character-rename.service,canonical-facts.service,story-quality-gate,short-rewrite.service}.ts`
- `packages/story-localization/src/short-rewrite.service.unit.test.ts`
- Required plan/run reports

## Checks

Exact two-test filter ran three times under the repair budget. Final result:
resume identity passed; enforce persistence failed at `summary.completed` after
`SUPERNATURAL_RULE_MISSING` triggered an exhausted repair mock. Targeted
`git diff --check` passed.

## Risks / Follow-up

Resolved in the follow-up semantic-rule task: the matcher regression passed,
and enforce persistence plus plan-change resume identity both passed. Rollout
remains `shadow`; no provider call ran.

## Commit

`f29a43c` (changes uncommitted).
