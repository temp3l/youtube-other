# History V3.6 autonomous semantic drain

## Phase 2.16

- starting SHA: `900be4197a81c976e85737fe49088538a3d60a15`
- target: Black Death proof-aware multi-claim relation-evidence bridge
- change: added `RelationProofEvidenceV36` and a prototype-only proof-aware policy-response wrapper; existing single-claim validation remains unchanged
- before/after: candidates `52 -> 52`; validated relations `30 -> 30`; proof bridge `absent -> valid`
- invariants: all applicable controls zero; V3.5 unchanged; provider/LLM calls `0`
- commit/tag: phase baseline recorded after validation
- artifact: `artifacts/shadow/history-v3.6/history-v3.6-relation-proof-evidence-review-20260809T192227Z.zip`
- next decision: mechanically admit the already-proven relation only through this bridge

## Phase 2.17

- starting SHA: `0cca700f6a0e5e42cdeacde7d1485cc9d80949bb`
- target: deterministic proof-aware Black Death policy-response admission
- change: admitted the sole validated proof as a modal relation with two support claims; no legacy validator changes
- before/after: candidates `52 -> 53`; validated relations `30 -> 31`; remaining gaps `9 -> 8`
- invariants: all applicable controls zero; V3.5 unchanged; provider/LLM calls `0`
- commit/tag: phase baseline recorded after validation
- artifact: generated after commit
- next decision: recompute the remaining inventory and classify whether any next action avoids a human taxonomy/modality decision
