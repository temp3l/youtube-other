# M2-002 canonical mathematics workflow adapters

## Summary

Bound the 16 executable mathematics tasks through publish dry-run to canonical `WorkflowOperator` handlers. Added authoritative curriculum/profile/verifier readiness, dependency-artifact fingerprints, immutable validated evidence promotion, provider authorization, provider-free fixture simulation, canonical legacy command adapters, and verifier protocol v3 bootstrap alignment. Live publish remains unimplemented and approval-gated.

## Changed paths

- `packages/math-education/src/{task-registry,profile-bindings,profile-contracts,index}.ts`
- `packages/math-education/src/orchestration/canonical-task-adapters.ts`
- `packages/workflow-engine/src/workflow-operator.ts`
- `packages/shared/src/artifact-path-resolver.ts`
- `apps/cli/src/{math-workflow-runtime,math-commands,workflow-commands,production-caller-migration}.ts`
- Corresponding focused unit tests
- `python/math-verifier/setup-offline.sh`

## Tests/checks

- Math registry focused test: last run failed in provider-free traversal because timing evidence serialized invalid durations; production defect fixed, rerun budget exhausted.
- CLI focused test: last run failed resume-after-promotion; adapter fixed, rerun budget exhausted.
- Shared/workflow-engine, math-education, and CLI builds: passed after targeted fixes.
- Packaged graph, provider-free run, status, and resume: passed; 16 cache-valid successes, no provider call, approval stop.
- Offline bootstrap: exact external blocker, missing `/tmp/m2-002-no-wheelhouse` (exit 66).

## Unresolved risks / follow-up

Run the two focused test files in a fresh verification budget. Supply an approved wheelhouse and rerun bootstrap.

Commit hash: not committed.
