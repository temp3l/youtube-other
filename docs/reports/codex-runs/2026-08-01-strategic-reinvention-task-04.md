# Strategic Reinvention Task 04 Report

Summary: added deterministic, fail-closed source authorization and canonical-byte provenance persistence. Wave 3 persistence now walks from an open filesystem descriptor with `O_DIRECTORY|O_NOFOLLOW`, binds the manifests directory, creates/syncs a no-follow exclusive temporary file relative to that descriptor, and atomically renames within it. Linux `/proc/self/fd` is required; unsupported platforms fail closed. Static symlink and active parent-swap tests prove zero outside writes. Explicit synthetic transformations remain fail-closed.

Changed paths: `packages/source-ingestion/src/index.ts`, `packages/source-ingestion/src/content-source.unit.test.ts`, `packages/strategic-reinvention/src/index.ts`, `packages/strategic-reinvention/src/source-policy.ts`, `packages/strategic-reinvention/src/source-policy.unit.test.ts`.

Checks: targeted domain/shared builds passed to refresh stale workspace contracts. Prescribed source-ingestion test passed (4 tests); prescribed source-policy test passed (13 tests); source-ingestion typecheck passed. Earlier `git diff --check` passed.

Commit: `0fd0be5`.

Unresolved risks: concrete authorization must be supplied by the strategic workflow before adaptation or publication; no operator rights/access evidence exists, so production remains blocked. Follow-up: Task 07 must bind `evaluateSourcePolicy` to the generic ingestion authorization callback.
