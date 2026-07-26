# Controlled Horror Evaluation

This directory contains the preregistration and decision record for the first
production evaluation of the horror affect strategy. Both records are
versioned, hash-bound, and currently fail closed to `remain-shadow`.

The historical v1 manifest leaves its decisions unresolved. V2 resolved the
evaluation design but included Episode 034, which has no accepted canonical
Full lineage. Before outcome inspection, immutable v3 replaced that unit with
Episode 028. V3 freezes the metric, threshold, cohort, budget, analytics
authority, and rollout authority. Its source-backed generation preflight is
ready. The execution ledger, explicit paid-dispatch authorization contract,
and authorization-gated production boundary are fake-validated. A bounded
authorization artifact is persisted for the window beginning
`2026-07-26T14:00:00+02:00`; all eight ledger units remain `planned`, with zero
reserved calls and USD 0 charged. Paid execution stopped before dispatch
because configured credentials require rotation. With no v3 candidates,
ratings, or audience import, the missing-outcome rule remains `remain-shadow`.

## Operating Contract

1. An authorized human resolves every manifest decision and identifies separate
   full and Short samples before outcomes are inspected.
2. `persistHorrorEvaluationManifest` writes the immutable preregistration.
3. Candidate generation requires a hash-bound preflight with exact accepted
   cleaned-source, canonical Full, baseline Full, and baseline Short lineage.
   It fixes enforce-mode generation at zero retries and checks aggregate/per-unit
   ceilings before dispatch.
4. `candidate-execution-ledger.json` binds the exact manifest, preflight,
   strategy versions, ordered units, and USD 8/eight-call ceilings. The
   mock-only adapter durably reserves one call and USD 1 before invocation,
   completes Full before its paired Short, reuses completed units, and marks
   interrupted reservations `uncertain` without automatic retry. Uncertain
   remote state requires separate operator reconciliation; the ledger does not
   claim provider-level exactly-once execution.
5. `candidate-dispatch-authorization.json` must bind an identified authority,
   approval reference, validity window, exact ledger binding and ordered sample,
   eight-call/USD 8 aggregate limits, one-call/USD 1 unit limits, and zero
   retries. Missing, placeholder, stale, expired, partial, reordered, extra, or
   changed authorization fails before the production provider boundary.
6. Authorized candidate execution reuses the ledger state machine, requires an
   injected existing-contract validator, and atomically writes validated output
   only to the preflight-owned strategy path. Tests use fake providers only.
7. Production candidate sets must match the manifest ID/hash, exact sample,
   strata, strategy versions, artifact hashes, and accepted final lines.
8. Candidate sets are persisted immutably before blind packets. Full and Short
   reviewer packets and answer keys are stored separately; partial or changed
   records fail closed.
9. Blind editorial packets reuse deterministic seeded assignment and remain
   separate by format. Candidate lineage stays out of reviewer packets; raters
   use non-secret provenance IDs.
10. Mediaforge accepts only an explicitly imported, already-authorized aggregate
   metrics artifact. It has no YouTube fetch operation.
11. Normalized retention, early retention, average percentage viewed, and ending
   retention are story outcomes. CTR remains title/thumbnail evidence unless
   those variables were controlled.
12. Insufficient strata are exploratory. Full and Short results are never pooled.
13. `promote-to-enforce` requires every source-plan gate and matching human
   approval. A configuration transition is declarative, makes zero provider
   calls, retains evidence paths, and never rewrites accepted stories.

Runtime evaluation artifacts:

- `evaluation-manifest.json`
- `candidate-generation-preflight.json`
- `candidate-execution-ledger.json`
- `candidate-dispatch-authorization.json`
- `production-editorial-candidates.json`
- `blind-review-full.json` and `blind-review-full-answer-key.json`
- `blind-review-short.json` and `blind-review-short-answer-key.json`
- `audience-metrics-import.json`
- `rollout-decision.json`

Current records:

- `evaluation-manifest.v1.json`
- `evaluation-manifest.v2.json`
- `evaluation-manifest.v3.json`
- `candidate-generation-preflight.v3.json`
- `rollout-decision.v1.json`
- `rollout-decision.v2.json`

Supporting approval record:

- `production-evaluation-approval-packet.v3.md` records the corrected bounded cohort,
  decision defaults, cost ceiling, and non-secret authority scopes. It cannot
  by itself authorize paid dispatch or rollout promotion. Production execution
  remains disabled until the persisted dispatch window is active and exposed
  credentials have been rotated. The bounded authorization does not authorize
  rollout promotion.
