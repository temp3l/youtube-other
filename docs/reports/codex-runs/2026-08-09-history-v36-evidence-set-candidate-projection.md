# V3.6 evidence-set candidate projection

Summary: Added only `atomic-contains-evidence-of-evidence-set-candidate.v1`. It aggregates asserted native `contains-evidence-of` atoms within one episode, canonical claim, exact span/hash, and resolved target, requiring two distinct canonical members. The two approved Bronze Age and Franklin candidates validate; Franklin graves remain one grouped member. Metrics: candidates 50→52, relations 28→30, candidate gaps 11→9. Provider/LLM calls: 0.

Changed files: V3.6 atomic projector and representative integration/accounting; focused projector, inventory, enrichment, generator regression tests; Phase 2.12 artifact generator; this report.

Tests/checks: History typecheck passed; 108 focused tests passed, including 45 golden fixtures; targeted ESLint and `git diff --check` passed. Artifact checksum/ZIP checks run after commit.

Results/risks: validator, relation contract/taxonomy, structured claims, atomic grounding semantics, movement logic, V3.5, and frozen seven were unchanged. Remaining risk is limited to the intentionally unimplemented cross-claim proof layer.

Commit/tag: see `history-v3.6-evidence-set-candidate-baseline`.

Follow-up: design an assertion-preserving cross-claim proof-layer contract; do not implement it in Phase 2.12.
