# Codex run: V3.6 causal modality contract

Summary: Chose relation-kind-specific modality and added optional causal-link assertion status. Missing means asserted; explicit asserted preserves legacy IDs. The two causal gaps are now representable, while the Armada movement case remains blocked because current movement semantics lack an actor and complete route.

Changed files: relation schema/validator/tests, generated relation contract docs, decision record, review generator, and autonomous journal.

Tests/checks: History typecheck passed; focused relation tests (59, including 45 goldens) passed; diff check passed. Provider/LLM calls: 0.

Risks/follow-up: admit only the two causal atoms with exact native lineage; do not extend movement or taxonomy.
