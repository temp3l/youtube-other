# Private owner attestation

## Summary

Implemented Stephan's explicit repository-admin attestation as a hash-bound
alternative for exact private/no-claim Class 5 production. It covers all four
implemented `standard` content families, cannot enable public use, does not mark
the draft curriculum externally reviewed, and authorizes no provider calls.
This was not based on `docs/plans/*`.

## Changed paths

- `packages/math-education/{data/reviews/v1,src/review}`
- Math capability, canonical adapter/runtime, export, and focused tests
- Curriculum review packet and private-attestation policy
- This report

## Tests/checks

- Private-attestation focused test: 2/2 passed after integration.
- Math-education and CLI typechecks: passed.
- Task-registry file: new assertion passed; existing traversal failed because
  its `1.0.0-test-reviewed` fixture is stale against draft-bound production
  content. Classified unrelated stale fixture; not edited.

## Commit hash and risks

HEAD `7d8c03ff18891058889c594741e56e516f552fee`; uncommitted. M2-009 still needs
profiles, media pilot execution, failure probes, and acceptance. External review
and all public publishing remain blocked.
