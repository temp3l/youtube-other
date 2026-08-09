# V3.6 all-40 semantic release readiness

Baseline: `72b4ee8010f22f6ea3c663edc8c3e90dbeb7aa67` (`history-v3.6-autonomous-event-location-drain-baseline`). Corpus: 40/40 frozen V3.5 episodes; provider and LLM calls: 0.

Aggregate: 3,774 claims, 0 native structured claims, 111 compatibility propositions/atoms, 236 candidates, 103 validated relations, and 0 admissible cross-claim proofs. Distribution: causal 77, dependency 22, movement 1, spatial-comparison 1, evidence-set 2; all other accepted kinds 0.

Hard invariants: all zero. Determinism: PASS, hash `e3eaabfa34da8d3ed2f90be52bba80159524b605109911881d70168b182728e4`. V3.5 isolation: PASS. Accepted terminal controls remain: two source-incomplete movement, one architecture-blocked movement, two intentionally non-relational.

Changed files: census generator, release-readiness artifact, this report. Checks: history typecheck; targeted ESLint; 193 V3.6 tests; two all-40 runs; checksum and ZIP integrity. Result: `READY_WITH_NONBLOCKING_TERMINAL_CASES`. Risk: frozen all-40 inputs lack native sidecars, so native/proof/event-location all-40 coverage remains unavailable. Follow-up: V3.6 compiler shadow integration.
