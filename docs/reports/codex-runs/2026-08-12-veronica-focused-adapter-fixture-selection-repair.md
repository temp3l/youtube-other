# Focused adapter fixture/selection repair

## State

`BLOCKED_DETERMINISTIC_ACTION_DIVERSITY`  
`IMAGE GENERATION AUTHORIZED: NO`

## Failure matrix

Five QA purity/identity cases share one `STALE_FIXTURE`: they copied 01A planner-v3/diversity-v1 artifacts, so v4/v2 readiness correctly stopped before admission. A temporary calibrated replacement still repeats a two-sentence script across more scenes; intended admission assertions remain unreached.

The preparation case is `STALE_FIXTURE` plus a generic strategy-coverage gap. Added typed `evidence-reveal` and source-supported insufficiency/evidence candidates; this removed `OPENING_ACTION_NOVELTY_LOW`. Remaining blockers are `ADJACENT_VISUAL_DUPLICATION`, `ACTION_MONOTONY`, and `MECHANISM_REPETITION`, caused by duplicated fixture narration.

## Verification

Exact six-test command: 6 failures reproduced; two bounded repairs attempted. Final setup fails before tests. `git diff --check`: PASS. Typecheck/lint/build not run because focused tests did not pass.

01A plan, beats, prompts, admission, and QA hashes: unchanged. HEAD: `cf42724e2361e11e39b49f454422a9e76af5f6ee`.

Changed: `positioning-visual-contracts.ts`, `veronica-sequence-diversity.ts`, `positioning-production-adapter.unit.test.ts`, this report.

Next: replace the synthetic script with scene-complete, source-supported action progression, then rerun the adapter file.

All external calls: `0`; cost: `$0`.
