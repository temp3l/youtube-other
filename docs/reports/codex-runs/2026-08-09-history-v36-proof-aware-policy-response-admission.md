# V3.6 proof-aware policy-response admission

Summary: Admitted exactly one Black Death policy-response relation from a validated `CrossClaimProofV36` via `RelationProofEvidenceV36`. It preserves the condition’s `uncertain` and response’s `attempted` statuses, exact two-claim support, lineage, joins, and direction. No generic multi-claim inference or legacy-validator weakening was added.

Changed paths: bounded admission module/test, representative experiment/candidate inventory wiring and expectations, review generator, architecture note, run journal, and this report.

Tests/checks: History typecheck passed; 78 focused tests passed including 45 golden fixtures and same-eight regression; targeted ESLint and diff check passed. Artifact ZIP integrity passed. Provider/LLM calls: 0.

Risks/follow-up: The remaining eight gaps need fresh case-level classification. Movement remains blocked without destinations; any new taxonomy or relation-wide modality extension requires a human decision.
