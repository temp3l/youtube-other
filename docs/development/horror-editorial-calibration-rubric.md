# Horror Editorial Calibration Rubric

Version: `horror-editorial-rubric-v1`

This rubric supports offline, blind comparison of two source-bounded horror
renderings. It is diagnostic research material, not a production quality gate.
It must not change prompt selection, acceptance thresholds, cache identity, or
release decisions.

## Corpus And Evaluation Boundary

The corpus lives in
`packages/story-localization/src/__fixtures__/horror-calibration/corpus.json`.
It contains seven compact, manually authored synthetic packages because no
permission to copy production episodes was supplied. Every package records
provenance, permitted use, immutable facts, the accepted final line, eligibility,
strata, and expected structural findings.

The frozen pre-evaluation record is
`packages/story-localization/src/__fixtures__/horror-calibration/baseline-manifest.json`.
Its manifest hash is
`35983ebd7ff781233bc8bc873fab73d96b06cbe9a8f7f0ba41392b4c5be4222a`.
It fingerprints source and candidate text, records word counts and strata, and
states that no model analysis, production gate, provider cost, or generated
asset is part of this baseline. Manually authored candidates do not have a
production prompt fingerprint.

Human ratings, expected deterministic findings, and any future model analysis
must remain separate datasets. Do not reveal the corpus metadata, expected
findings, baseline manifest, seed, or answer key to raters.

## Sampling And Blinding

For the initial calibration round:

1. Include all seven cases. Do not substitute a production episode without a
   separately recorded permission decision.
2. Use one explicit, pre-recorded seed for the round. Generate the review packet
   and retain its answer key in a reviewer-inaccessible location.
3. Assign at least three independent raters per item when practical. Record the
   actual count; do not imply reliability when fewer ratings are available.
4. Do not show a reviewer the same case under a second seed in one session.
5. Analyze full and Short items separately before any combined summary.
6. Preserve format, locale, duration band, and policy metadata from the packet
   so results remain stratifiable.

`prepareBlindHorrorEditorialReview` deterministically hashes the seed and case
identity to randomize both item order and A/B assignment. The exported packet
contains opaque review IDs, A/B labels, text, and strata. The separate answer key
contains the original case and baseline/strategy mapping. Distribute only the
packet.

## Rater Instructions

Read A and B once without editing. Read them a second time to record evidence.
Judge only the supplied narration and assume both candidates must preserve the
same source. Do not reward added facts merely because they are vivid. For every
dimension, rate each candidate from 1 to 5 and cite a concrete phrase, event, or
transition. Then record confidence from 1 to 5, force a preference for A or B,
and explain the deciding evidence. A rater may not submit `tie`.

Use these shared ordinal anchors:

- `1` — breaks the dimension or is materially misleading.
- `2` — weak; a conspicuous problem dominates.
- `3` — adequate; understandable and functional, with meaningful limitations.
- `4` — strong; specific evidence supports the effect with only minor issues.
- `5` — exceptional for this pair and format; coherent, source-bounded, and
  sustained.

Rate the dimensions independently:

| Dimension       | Question                                                                                                                 |
| --------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Comprehension   | Can the listener track who acts, what changes, why it changes, and what the ending means?                                |
| Suspense        | Does a concrete threatened outcome remain unresolved while credible responses narrow?                                    |
| Curiosity       | Is there a salient question whose partial answers make the listener want specific missing information?                   |
| Earned surprise | Does a reversal change interpretation while remaining supported by earlier setup and source facts?                       |
| Presence        | Do viewpoint, concrete action, and relevant sensory detail make events feel immediate rather than summarized?            |
| Emotional cost  | Does the protagonist make an observable choice that risks or sacrifices something established as meaningful?             |
| Payoff          | Does the ending answer or productively reframe the central question without an arbitrary twist or explanatory aftermath? |

High intensity is not automatically suspense, and ambiguity is not automatically
curiosity. Penalize invented motives, threat powers, responses, or causal claims
under the dimension they damage, especially comprehension and earned surprise.

## Validation And Aggregation

Ratings are valid only when all seven dimensions and all fourteen candidate
evidence notes are present, scores and confidence are integers from 1 through 5,
the packet and item IDs match, and the pairwise preference is A or B. Reject
malformed or duplicate reviewer/item submissions; do not repair them silently.

`aggregateBlindHorrorEditorialRatings` reports, per blinded item:

- rating count and explicitly missing reviewer IDs;
- arithmetic mean and median for every candidate/dimension;
- mean and median confidence; and
- A/B preference counts.

Do not average ordinal dimensions into a single quality score. Do not impute
missing ratings. An item with no valid ratings reports `null` summaries. Equal
A/B preference counts are an aggregate tie and remain a tie; do not break them
with dimension means. Report dimension distributions and rater disagreement
before consulting the answer key. Unblind only after the round is closed.

No primary optimization metric or practical improvement threshold is established
by this rubric. Those are explicit product decisions and must be pre-registered
before using results to support rollout.

## Limitations

This corpus is deliberately small, synthetic, English-only, and limited to
compact examples. It tests whether a process exposes recognizable structural
failure modes; it does not estimate audience response, production retention, or
cross-locale effectiveness. Raters are not interchangeable, ordinal differences
are not interval measurements, and blinding the labels cannot hide stylistic
clues in the text. Results may guide diagnosis and later study design, but they
must not become production gates or claims about YouTube performance.
