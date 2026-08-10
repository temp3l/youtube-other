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

## Phase 2.18

- starting SHA: `20a1a44186d885f7566d301edadbe9401d1e3485`
- target: exact three assertion/modality blocks
- decision/change: Option A; add optional causal-link modality only; Chernobyl/Titanic become representable, Armada stays blocked for missing actor/route shape
- before/after: candidates `53 -> 53`; validated relations `31 -> 31`; actionable modality cases `3 -> 2 representable + 1 blocked`
- invariants: all applicable controls zero; V3.5 unchanged; provider/LLM calls `0`
- commit/tag: causal modality contract baseline
- artifact: generated after commit
- next: mechanically admit only the two exact causal atoms through typed native lineage

## Phase 2.19

- starting SHA: `f0551b785a18d60d65bd8281c16cbb8ecd66650f`
- target: Chernobyl uncertain and Titanic reported causal atoms
- decision/change: exact native-lineage modal-causal admission; no generic predicate mapping
- before/after: candidates `53 -> 55`; validated relations `31 -> 33`; gaps `8 -> 6`
- invariants: all applicable controls zero; V3.5 unchanged; provider/LLM calls `0`
- commit/tag: modal causal admission baseline
- artifact: generated after commit
- next: taxonomy mismatch is the required human decision gate
