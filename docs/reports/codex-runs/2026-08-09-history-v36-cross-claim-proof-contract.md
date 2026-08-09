# V3.6 cross-claim proof contract

Summary: Added a bounded, assertion-preserving `CrossClaimProofV36` for the sole approved Black Death gap. It validates the explicit uncertain-demand → attempted-restriction proof, retains source lineage and canonical bindings, and has no relation-candidate admission.

Changed paths: V3.6 proof contract, fixture constructor, focused tests, public exports, generated schema/contract docs, architecture note, and review generator.

Tests/checks: History typecheck; 83 focused tests including 45 golden fixtures, Phase 2.12 projector, Phase 2.9 inventory, and proof negatives; targeted ESLint; diff check passed.

Risks/follow-up: The typed dependency remains inventory-approved, and no policy-response candidate can preserve this modality tuple yet. V3.5 and existing relation contracts/projectors remain unchanged.
