# V3.6 policy-response admission contract

The single Phase 2.13 proof can construct a `ProofBackedPolicyResponseCandidateV36` only after the cross-claim validator accepts it. The candidate carries the proof ID/pattern, directed participants, the `uncertain` condition and `attempted` response statuses, the typed join, and complete claim/proposition/atom/span lineage.

Current `PolicyResponseRelationV36` has only `condition`, `response`, episode/support evidence, and direction. It has no per-premise assertion or modality representation. It is therefore classified `REPRESENTABLE_ONLY_WITH_MODALITY_LOSS` for this proof, and the independent admission assessor returns `BLOCKED_MODALITY_LOSS`.

No relation candidate or relation is emitted. Candidate semantic identity excludes source lineage; the separate candidate evidence fingerprint preserves proof fingerprint and canonicalized premise lineage. This phase does not change relation schema, relation taxonomy, the existing relation validator, or V3.5.
