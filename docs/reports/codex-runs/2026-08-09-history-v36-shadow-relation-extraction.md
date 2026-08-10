# V3.6 representative shadow relation extraction

Summary: Added a bounded structured-claim candidate proposer, strict validation accounting, representative differential artifact generator, and provenance corpus identity. V3.5 remains untouched.

Changed paths: `packages/history/src/v36/representative-shadow-extraction-v36.{ts,unit.test.ts}`, `review-provenance-v36.ts`, `v35-v36-diff-v36.ts`, `scripts/generate-history-v36-representative-shadow-review.ts`, V3.6 docs/schema.

Tests: focused V3.6 suite 73/73; `@mediaforge/history` typecheck; targeted ESLint.

Commit hash: recorded after commit.

Unresolved risks: bounded extraction has deliberately low recall; review artifact awaits independent semantic review. No V3.6 compiler, renderer, or V3.5 code changed.
