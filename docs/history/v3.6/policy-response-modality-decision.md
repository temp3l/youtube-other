# V3.6 policy-response modality decision

## Decision

Select `OPTION_A_POLICY_RESPONSE_SPECIFIC_MODALITY`.

`PolicyResponseRelationV36` gains optional `conditionAssertionStatus` and `responseAssertionStatus` fields using the canonical `AtomicAssertionStatusV36` vocabulary. Direction remains `condition -> response`. Missing fields have exactly one legacy meaning: `asserted/asserted`. Repository projection code establishes that meaning by rejecting every non-asserted proposition before the V2 relation boundary.

The relation schema advances from `history-explanatory-relations.v2` to `.v3`. The parser continues to accept V2 artifacts, while V2 artifacts cannot carry the new fields. Existing relations, validator outcomes, serialization, evidence fingerprints, and semantic IDs remain unchanged. Explicit `asserted/asserted` canonicalizes to the legacy identity payload. Any non-default premise modality participates in semantic identity because it materially changes what the relation asserts.

## Rejected options

Option B is semantically capable but premature. No second relation variant currently demonstrates a need for generic directed-premise wrappers, and replacing named condition/response fields would enlarge migration, validator, and serialization scope.

Option C is safe and keeps the proof-backed candidate lossless upstream, but unnecessarily withholds a validated semantic capability after a bounded compatible extension has been demonstrated. Relation admission is still not performed in Phase 2.15.

## Prototype boundary

The Black Death candidate maps losslessly to an explicit `uncertain` condition and `attempted` response. The prototype schema and contract assessor validate it, its semantic ID is deterministic, and its evidence fingerprint remains support-provenance-only. Conceptually its representation classification becomes `ADMISSIBLE_LOSSLESS`; the Phase 2.14 production assessor remains `BLOCKED_MODALITY_LOSS`, and no relation candidate or validated relation is added.

The next migration impact is bounded to a separately reviewed admission/validator-evidence task. No V3.5 code, compiler, relation taxonomy, or cross-claim proof contract changes here.
