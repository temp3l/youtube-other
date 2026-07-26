# Task 03 — Calibration Corpus And Editorial Rubric

Implement only this task after Task 01. This is an offline evaluation task; do
not change production story generation. Follow this folder's `README.md`.

## Goal

Create a small, approved, non-generated calibration corpus and a reproducible
blind editorial comparison rubric for scary, interesting rewrites.

## Inspect First

- `packages/story-localization/src/__fixtures__/story-quality/`
- `packages/story-localization/src/horror-affect-plan.unit.test.ts`
- `packages/story-localization/src/story-production-analysis.ts`
- `packages/story-localization/src/story-quality-gate.ts`
- `docs/plans/research-informed-horror-storytelling-plan.md`
- existing fixture and evaluation conventions under
  `packages/story-localization/src/`

## Required Work

1. Add only fixtures the repository owner has approved for this purpose. If
   episode permission is unavailable, use compact synthetic source packages
   representing failure modes rather than copying production stories.
2. Cover at least:
   - no central uncertainty;
   - arbitrary twist;
   - passive protagonist;
   - repetitive maximum intensity;
   - rule without setup/payoff;
   - strong question-response-cost-payoff structure; and
   - a control case where extra horror shaping would distort the source.
3. Store fixture provenance, permitted use, immutable facts, final line, expected
   eligibility, and expected structural findings in machine-readable metadata.
4. Implement a deterministic offline harness that anonymizes and randomizes
   baseline/strategy labels from an explicit seed.
5. Define a rubric with separate ordinal ratings for comprehension, suspense,
   curiosity, earned surprise, presence, emotional cost, and payoff. Include
   confidence, evidence notes, and a forced pairwise preference.
6. Keep human ratings separate from model analysis and deterministic failures.
   Do not turn rubric scores into production gates.
7. Document sampling, rater instructions, aggregation, ties, missing ratings,
   and limitations. Record a pre-evaluation baseline manifest/hash.

## Focused Verification

- Test fixture schema validation, stable anonymization/randomization, seed
  reproducibility, malformed rating rejection, and aggregation.
- Use temp output only; do not rewrite fixtures during tests.
- Run the one directly affected test file and, if applicable, the package
  typecheck.

## Acceptance Criteria

- No production runtime, prompt, threshold, or cache behavior changes.
- Corpus provenance and permission are explicit.
- Reviewers cannot infer baseline/strategy labels from exported review data.
- Results remain stratifiable by format, locale, duration, and policy metadata.
- No live model, provider, or analytics call occurs.
