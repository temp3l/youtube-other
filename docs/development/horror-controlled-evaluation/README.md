# Controlled Horror Evaluation

This directory contains the preregistration and decision record for the first
production evaluation of the horror affect strategy. Both records are
versioned, hash-bound, and currently fail closed to `remain-shadow`.

The historical v1 manifest leaves its decisions unresolved. V2 resolved the
evaluation design but included Episode 034, which has no accepted canonical
Full lineage. Before outcome inspection, immutable v3 replaced that unit with
Episode 028. V3 freezes the metric, threshold, cohort, budget, analytics
authority, and rollout authority. Its source-backed generation preflight is
ready, and a mock-only execution adapter now persists an atomic, hash-bound
call/cost ledger before each fake invocation. Both steps dispatched zero
production provider calls. With no v3 candidates, ratings, audience import, or
approval, the manifest's missing-outcome rule remains `remain-shadow`.

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
5. Production candidate sets must match the manifest ID/hash, exact sample,
   strata, strategy versions, artifact hashes, and accepted final lines.
6. Candidate sets are persisted immutably before blind packets. Full and Short
   reviewer packets and answer keys are stored separately; partial or changed
   records fail closed.
7. Blind editorial packets reuse deterministic seeded assignment and remain
   separate by format. Candidate lineage stays out of reviewer packets; raters
   use non-secret provenance IDs.
8. Mediaforge accepts only an explicitly imported, already-authorized aggregate
   metrics artifact. It has no YouTube fetch operation.
9. Normalized retention, early retention, average percentage viewed, and ending
   retention are story outcomes. CTR remains title/thumbnail evidence unless
   those variables were controlled.
10. Insufficient strata are exploratory. Full and Short results are never pooled.
11. `promote-to-enforce` requires every source-plan gate and matching human
   approval. A configuration transition is declarative, makes zero provider
   calls, retains evidence paths, and never rewrites accepted stories.

Runtime evaluation artifacts:

- `evaluation-manifest.json`
- `candidate-generation-preflight.json`
- `candidate-execution-ledger.json`
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
  remains disabled until a later human explicitly authorizes paid dispatch.
