# V3.6 policy-response admission contract

The single Phase 2.13 proof can construct a `ProofBackedPolicyResponseCandidateV36` only after the cross-claim validator accepts it. The candidate carries the proof ID/pattern, directed participants, the `uncertain` condition and `attempted` response statuses, the typed join, and complete claim/proposition/atom/span lineage.

At the accepted Phase 2.14 baseline, `PolicyResponseRelationV36` had only `condition`, `response`, episode/support evidence, and direction. It had no per-premise assertion or modality representation. The frozen production admission assessor therefore remains `REPRESENTABLE_ONLY_WITH_MODALITY_LOSS` and returns `BLOCKED_MODALITY_LOSS` during the Phase 2.15 prototype.

Phase 2.15 advances the prototype relation schema to V3 with policy-response-specific optional premise modality. This makes the proof-backed candidate losslessly representable in the prototype only; it does not connect that representation to production/shadow admission.

No relation candidate or relation is emitted into the corpus. Candidate semantic identity excludes source lineage; the separate candidate evidence fingerprint preserves proof fingerprint and canonicalized premise lineage. Phase 2.15 changes only the V3.6 relation schema/validator's modality awareness and does not change relation taxonomy, production admission, cross-claim proof semantics, or V3.5.

Phase 2.16 adds `RelationProofEvidenceV36`, a bounded bridge constructed only from a proof that has already passed `CrossClaimProofV36` validation. It retains the proof ID, pattern, validator version, ordered claim/proposition/atomic lineages, source spans/hashes, resolved participant joins, direction, and asymmetric premise modalities. A prototype wrapper can validate one modal `policy-response` relation against this bridge without changing the existing single-claim relation validator or admitting the relation to the corpus.

Phase 2.17 admits that one wrapper into the representative V3.6 shadow corpus. The new candidate is explicitly sourced as `proof-aware-relation-evidence`; it has two support claims and cannot be produced for another episode or from arbitrary claim pairing. The Black Death relation is `conditionAssertionStatus: uncertain` and `responseAssertionStatus: attempted`; legacy relations, relation taxonomy, V3.5, and the single-claim validator are unchanged.
