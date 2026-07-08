# Code Review Follow-Up Implementation Plan

Source audit: `docs/audits/code-review/code-review-report.md`

## Recommended Implementation Order

1. `task-01-characterization-tests`
2. `task-02-path-resolution-hardening`
3. `task-03-manifest-validation-hardening`
4. `task-04-type-safety-cleanup`
5. `task-05-pipeline-stage-contracts`
6. `task-06-localization-asset-identity`
7. `task-07-batch-image-provider-boundary`
8. `task-08-rendering-hardening`
9. `task-09-remote-rendering-hardening`
10. `task-10-legacy-cleanup-after-tests`
11. `task-11-final-verification`

## Task Dependency Graph

- `task-01` blocks all behavior-changing tasks.
- `task-02` blocks `task-05`, `task-06`, `task-08`, and `task-10`.
- `task-03` blocks `task-05`, `task-07`, `task-08`, `task-09`, and upload-selection changes.
- `task-04` can run after `task-01`; telemetry redaction can be first in that task.
- `task-05` depends on `task-02` and `task-03`.
- `task-06` depends on `task-02` and should finish before broad image reuse changes.
- `task-07` depends on `task-03` and coordinates with `task-06`.
- `task-08` depends on `task-02` and `task-03`.
- `task-09` depends on `task-08`.
- `task-10` depends on `task-02` through `task-09`.
- `task-11` runs last.

## Safe Sequential Batches

- Batch A: characterization tests only.
- Batch B: path containment, manifest schemas, telemetry/type cleanup.
- Batch C: stage contracts, localization asset identity, provider boundary.
- Batch D: render hardening, then remote render hardening.
- Batch E: legacy cleanup, final verification.

## Tasks Safe To Parallelize

After `task-01`, `task-02` and telemetry-only portions of `task-04` can run in parallel if file ownership is disjoint. After `task-03`, `task-06` and provider-adapter design work in `task-07` can run in parallel with coordination around image batch identity fields.

## Tasks That Must Not Be Parallelized

Do not parallelize:

- `task-02` with `task-10`
- `task-05` with `task-10`
- `task-06` with image batch identity edits in `task-07`
- `task-08` with `task-09`
- any legacy deletion with path, manifest, or render contract changes

## Verification Gates

- Run the directly affected test file first with `pnpm test:focused -- <test-file>`.
- Use exact test-name filters only while debugging a single focused failure.
- After focused tests pass, run at most one affected-package typecheck.
- Do not run broad builds/tests, snapshot updates, provider calls, uploads, remote renders, or fixture regeneration without explicit authorization.
- For docs-only changes, run `git diff --check -- <changed-docs>`.

## Rollback Guidance

Keep each task in a small commit. Roll back by reverting the task commit and its matching tests. Do not remove characterization tests unless the protected behavior is intentionally retired.

## Recommended Next Step

Start with `task-01-characterization-tests.md`, prioritizing CR-001 through CR-004 and CR-011 through CR-013.
