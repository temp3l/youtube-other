# V3.6 contract preflight

Summary: Generated real Draft 2020-12 relation and provenance schemas from authoritative Zod validators, added structural rejection coverage, reconciled provenance history, and refreshed the V3.6 review ZIP.

Changed paths: `packages/history/src/v36/{explanatory-relation-v36,review-provenance-v36,contract-json-schema-v36.unit.test}.ts`; `scripts/generate-history-v36-relation-{contract-docs,ir-review}.*`; `docs/history/v3.6/*`.

Tests/checks: schema 6/6; relation IR 58/58; shadow extractor 5/5; history typecheck; targeted ESLint; ZIP and SHA-256 verification — all pass.

Commit hash: `022f2177cc0e66f47cb5d652d6d456ce12a5a7be`.

Unresolved risks: no representative extraction was run; the proof-bearing shadow extractor remains unchanged.
