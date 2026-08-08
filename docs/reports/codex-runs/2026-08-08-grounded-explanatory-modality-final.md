# Grounded V3.5 explanatory modality final

Date: 2026-08-08

Commits/tags: pre `cef3771b65d41e28a27eae6c7a73c880c48aae18` / `history-v3.5-grounded-modality-baseline-v4`; Phase A `972ee089f3c553bcd4ab37dd5a1409611fa4f991` / `history-v3.5-grounded-semantic-baseline`; final `dda3db61f209649f9e4d4872a8d16a63e2de7b83` / `history-v3.5-grounded-modality-baseline-v5`.

Changed in Phase B: `history-diagram-compile-v35.ts` and its unit test. Exact `B because A while C` clauses now compile as grounded convergence diagrams; concessive `even while` is rejected. This selects Stalingrad’s trap explanation and Caesar’s illegal-crossing explanation. All requested geographic candidates were reviewed; none had both bounded relationship evidence and safely resolved endpoints. Titanic/Chernobyl were not forced through unchanged edge gates. Phase A details and spatial-delta classifications are in `2026-08-08-grounded-semantic-baseline-phase-a.md`.

Final metrics: beats/qualifiers `1985/583`; geo facts `63/8/1`; maps `47/8/1`; diagrams `11 valid, 8 blocked`; one-way sequences, duplicate maps/groups, overflow, unsupported-valid nodes/edges, and cross-episode leakage `0`; coverage warnings `15 geo/24 diagram`; acceptance `40/40/40`.

Checks: focused diagram, modality, entailment/evidence, semantics, typecheck, ESLint, representative regeneration, and corpus acceptance passed. Only `TIMING_MEASUREMENT_REQUIRED` remains.

Pack: `history-approval-packs-v3.5-episodes-01-40-20260808T175333Z.zip`; provenance commit matches final SHA.
