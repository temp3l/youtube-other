# Local math render working paths

Changed files: `apps/cli/src/math-render-{hybrid,benchmark,remote}.ts`, `apps/cli/src/math-commands.ts`, focused tests, and `docs/architecture/media-assets-and-delivery.md`.

Summary: Math shard staging, remote downloads, calibration, benchmarks, deployments, and paid-plan fallback data now use the relevant workspace, artifact directory, or repository-local `.cache/math-pipeline` tree instead of the system temporary directory. Existing caller-selected workspaces remain authoritative.

Tests/checks run: focused Vitest for math commands, benchmark, workflow runtime, and remote rendering; CLI package typecheck; `git diff --check`; production-source scan for `/tmp` math renderer paths.

Results: 61/61 focused tests passed; diff/source checks passed. CLI typecheck remains blocked by unrelated existing locale/content-variant errors in `approval-commands.ts` and `packages/math-education/src/profile-fixture.ts`.

Commit hash: `3d6815c` (working tree changes are uncommitted).

Risks remaining: caller-supplied workspace paths are not rewritten; the unrelated typecheck failures remain.

Follow-up tasks: none planned.
