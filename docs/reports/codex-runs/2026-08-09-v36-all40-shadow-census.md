# V3.6 all-40 deterministic shadow census

Changed files: `scripts/generate-history-v36-all40-deterministic-shadow-census.ts`.

The reporting-only generator discovers the 40 authoritative V3.5-source episodes, runs frozen grounding/extraction twice, validates persisted objects, computes distributions/differentials, and produces a checksummed ZIP. It makes no LLM/provider calls and does not change V3.5 or V3.6 semantic behavior.

Checks: first all-40 execution completed; repeat semantic hash matched; JSON/schema validation, checksum verification, and ZIP integrity passed. Initial totals: 3,774 claims, 111 atoms, 236 candidates, 103 validated relations, 48 rejected candidates; all hard validated-relation invariants were zero.

Risk/follow-up: differential assessment is intentionally claim-grounded and fail-closed where frozen V3.5 has no relation-IR equivalent. No corpus finding was remediated.
