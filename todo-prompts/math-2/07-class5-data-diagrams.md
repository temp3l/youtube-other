# M2-007: Implement Class 5 data and diagram lessons

Implement production-capable German `standard` lesson specifications for `M5-DZ-001`
and `M5-DZ-002`.

## Dependencies

M2-001 must be accepted. Use the stable reviewed M2-003 scope and the shared versioned
lesson/review contract used by M2-004 through M2-006. Content work may proceed in parallel
with M2-002, but canonical integration and final acceptance require M2-002.

## Inspect first

- the two curriculum records and their source/prerequisite evidence
- current `M5-DZ-001` fixture
- verifier v3 data/statistics checks
- table, graph, bar-chart, localization, accessibility, and visual schemas
- workflow fact-lock and renderer integration tests

## Required behavior

- Cover collection into raw and tally lists, tally-group semantics, category totals,
  reading bar/column diagrams, and constructing diagrams from exact data.
- Represent source datasets as strict structured values. Derive totals, maxima, ordering,
  axis bounds, tick intervals, labels, and bars independently from that dataset.
- Reject duplicate categories unless explicitly aggregated, negative counts, fractional
  people/items where invalid, inconsistent tally groups, truncated axes that mislead,
  unlabeled units, mismatched bar heights, and charts with inaccessible distinctions.
- Bind every table cell, tally, axis, label, and bar to dataset identity and verified fact
  IDs. A renderer must not accept free-form chart values disconnected from verification.
- Provide deterministic German narration and visible labels. Spoken totals and category
  comparisons must preserve exact values.
- Include misconceptions around the fifth tally stroke, category omission, inconsistent
  scales, reading between tick marks, and treating bar width as the measured value.
- Keep any probability content outside the approved Class 5 scope and fail unsupported
  requests explicitly.

Create a review packet with datasets, derived values, chart contracts, questions,
solutions, sources, prerequisite links, and hashes. Capability activation requires exact
review evidence.

## Adversarial coverage

Test malformed tally groups, total mismatch, duplicate/omitted category, zero-only data,
negative count, nonzero axis origin without warning, inconsistent tick spacing, wrong bar
height, locale label transplant, reordered dataset under an old hash, inaccessible
color-only encoding, and unreviewed capability use.

## Verification and acceptance

Run the directly affected lesson/verifier test and one focused component/render test, then
at most one package typecheck. Both standard lessons must verify from their datasets,
produce deterministic accessible diagrams, localize without semantic drift, and remain
review-bound. Create the required Codex-run report. Do not call providers.
