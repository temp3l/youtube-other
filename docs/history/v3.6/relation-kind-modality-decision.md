# V3.6 relation-kind modality resolution

## Decision

Select `OPTION_A_RELATION_KIND_SPECIFIC_MODALITY` for the two causal gaps only. `CausalRelationV36` gains optional `causalAssertionStatus`, using the existing `AtomicAssertionStatusV36` vocabulary. Missing means `asserted`, because the pre-existing causal projector admitted only asserted atoms. Explicit `asserted` preserves the legacy semantic ID; each non-default status changes semantic identity while evidence fingerprints remain provenance-only.

The Chernobyl `uncertain` contribution and Titanic `reported` cause now have a lossless causal relation representation. This phase does not admit either relation.

Phase 2.19 admits exactly those two inventory-approved native atoms through `atomic-approved-modal-causal-candidate.v1`. The rule validates the exact claim ID, predicate, assertion status, native structured lineage, resolved distinct participants, deterministic relation identity, and exact validator modality. It is not a generic `causes` or `contributes-to` mapping.

## Rejected alternatives

`OPTION_B_SHARED_TYPED_RELATION_MODALITY` is premature: policy-response needs asymmetric named premises, whereas both causal gaps express one status on the causal link. A generic wrapper would add mapping and identity rules without another matching relation shape.

`OPTION_C_KEEP_BLOCKED` remains selected for the Spanish Armada case. Its `moves-through` atom has an actor and an intended via-place, but no origin/destination route shape; the existing movement relation is `from -> via[] -> to` and has no actor. Adding a movement field cannot represent that atom losslessly.

No V3.5 behavior, relation taxonomy, or existing relation identity changes.
