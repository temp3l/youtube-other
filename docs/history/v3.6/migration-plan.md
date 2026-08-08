# V3.6 shadow-mode migration plan

V3.5 remains the production/reference path throughout the first five phases. V3.6 candidate extraction may propose relations, but deterministic validation is the sole admission gate and compilers must not infer missing causal or spatial structure.

| Phase | Deliverable | Production effect |
| --- | --- | --- |
| 1 | IR, validators, golden corpus | None |
| 2 | Candidate extraction against golden corpus | Shadow only |
| 3 | Representative episode shadow corpus | Shadow only |
| 4 | Relation-consuming map/diagram compilers | Shadow only |
| 5 | 40-episode differential reports | Shadow only |
| 6 | Flagged V3.6 cutover | Explicit approval required |

The future flag contract is `HISTORY_RELATION_IR_VERSION=v35|v36-shadow|v36`. It is intentionally not wired into production configuration in Phase 1.
