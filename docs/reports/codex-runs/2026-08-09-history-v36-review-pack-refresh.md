# V3.6 review-pack refresh

Summary: Extended the V3.6 review-pack generator to run and report both hardened IR and shadow-extractor focused suites, then generated a fresh integrity-checked ZIP.

Changed paths: `scripts/generate-history-v36-relation-ir-review.mjs`.

Tests/checks: targeted ESLint; embedded V3.6 focused Vitest suites; ZIP and SHA-256 manifest verification — all pass.

Commit hash: `26a3b28e55e88e8fdcf4a86c60a03e16bc43671b`.

Unresolved risks: the pack verifies the structured-proposition shadow extractor only; it does not represent V3.5 production output or free-text/LLM extraction.
