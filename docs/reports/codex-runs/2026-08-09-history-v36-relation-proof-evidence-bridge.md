# V3.6 relation-proof evidence bridge

Summary: Added a bounded `RelationProofEvidenceV36` bridge for the one validated Black Death proof and a prototype-only modal policy-response wrapper. It retains both premise lineages, exact spans/hashes, joins, direction, proof metadata, and uncertain/attempted modality without changing corpus admission or the legacy single-claim validator.

Changed paths: bridge module/tests, public export, schema/architecture documentation, review generator, and this report.

Tests/checks: History typecheck passed; bridge tests (4), 45 golden relation fixtures, and the same-eight modality regression (11) passed; targeted ESLint, artifact ZIP integrity, and diff check passed.

Risks/follow-up: The Black Death relation is still prototype-only. The next bounded step is deterministic admission into the V3.6 representative shadow path using the bridge; V3.5 remains unchanged and provider/LLM calls were 0.
