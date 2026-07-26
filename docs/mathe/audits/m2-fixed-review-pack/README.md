# M2 fixed content-review pack

This pack replaces the four uploaded draft review packets with corrected,
hash-reproducible version-2 review targets.

## Included decisions

- `M2-004`: class-5 variable substitution and powers are deferred to years 7–9;
  written division is limited to one-digit divisors; estimation and probes are
  separated; examples for arithmetic laws are explicit.
- `M2-005`: prerequisite links are strengthened and the invalid-looking
  reduction notation `12/18 : 6/6` is replaced by separate division of
  numerator and denominator.
- `M2-006`: perimeter wording is corrected; learner-facing vector and
  Pythagorean reasoning is removed; technical coordinate verification may
  remain internal.
- `M2-007`: German locale labels are corrected (`Fuß`, `Grün`, `Bücher`) and all
  dataset hashes are regenerated.

## Approval status

The canonical targets are internally approved for implementation, test
generation and submission to an authorized curriculum reviewer.

They are **not production-approved**. The external
`lesson-content-review.v1` files intentionally remain `PENDING`, because a
reviewer identity, authority, timestamp, evidence and signature cannot be
truthfully fabricated.

## Integration order

1. Replace the old version-1 target specifications with the canonical version-2
   JSON files.
2. Update implementation fixtures, verifier expectations and snapshots.
3. Recompute repository-native hashes and compare them with this pack.
4. Run mathematical, visual, locale and prerequisite tests.
5. Have an authorized reviewer complete the four pending review records.
6. Enable production only when every exact bound hash has an external
   `APPROVED` record.
