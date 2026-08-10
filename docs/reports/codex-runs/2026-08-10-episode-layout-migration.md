# Episode layout migration

Changed files: `packages/shared/src/artifact-path-resolver.ts`, `packages/workflow-engine/src/artifact-repository.ts`, `apps/cli/src/episode-layout-migration-command.ts`, focused tests, and episode artifact migration docs.

Tests/checks: CLI migration test (9 passed); resolver/repository/render tests (16 passed); shared, workflow-engine, and CLI typechecks; shared/workflow builds; read-only Veronica dry-run.

Results: legacy candidates are versioned, read-only, and provenance-bearing. Migration copies or adopts only resolver-selected canonical targets, creates manifests and rollback metadata, rejects ambiguity/conflicts, and requires a hash-bound confirmation ID. Current dry-run: 10 manifest adoptions, 0 blocks.

Commit: not created; changes remain in the working tree.

Risks: legacy image/render and story adapters remain until documented gates pass. Packaged CLI was not rebuilt or executed after final documentation changes. No providers or media generation ran.

Follow-up: operator-review the dry-run ID, apply in a clean workspace if approved, then rerun packaged CLI and removal-gate searches.
