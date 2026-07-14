# Codex Prompt — Refactor Batch 12: Migration and Publish Approval

Implement Batch 12 from `docs/refactor/02-safe-implementation-batches.md`.
Do not start Batch 13 in this task.

## Required reading

Read `AGENTS.md`, closer package instructions, `docs/ai-context/context-pack.md`,
`docs/development/codex-verification-guardrails.md`, and these refactor sources:

- `02-safe-implementation-batches.md`, Batch 12
- `03-compatibility-and-migration.md`
- `06-duplicate-elimination.md`, relevant caller/removal gates
- `08-validation-and-release.md`, per-batch and compatibility gates
- `audit/03-artifact-matrix.md`
- `audit/README.md`, current Batch 11 acceptance
- `docs/reports/codex-runs/2026-07-14-batch-11-production-caller-migration.md`

Inspect source, tests, CLI registration, package scripts, and Vitest config
before changing behavior. Source and tests override stale documentation.

## Safety

Record `git status -sb` and preserve all pre-existing dirty-tree changes. Do not
reset, clean, restore, stage, or commit. Maintain a new-edit path ledger. Do not
move production artifacts, modify generated assets, call providers, upload,
publish, or perform remote mutations. Migration tests must use temporary
fixtures; publish tests must stop at a mocked mutation seam.

## Deliverable

- Implement deterministic dry-run-first migration plans with stable plan IDs,
  source/destination artifact references and paths, hashes, schemas, provenance,
  conflicts, operations, rollback operations, invalidations, warnings, and
  required approvals.
- Require explicit plan identity and confirmation for writes. Revalidate all
  hashes immediately before mutation.
- Reject traversal, containment escape, ambiguity, invalid source evidence, and
  differing valid destinations. Never silently overwrite or merge.
- Use same-filesystem atomic promotion, append-only migration events, and
  hash-validated rollback manifests. Support interrupted-operation recovery.
- Preserve canonical-first validated reads and declared legacy fallback until
  migration is explicitly accepted.
- Bind publish approval to exact artifact revisions/hashes, metadata,
  channel/account, locale, variant, dry-run evidence, and actor attribution.
- Fail closed before the publishing seam for missing, stale, mismatched, or
  unattributable approval.
- Preserve legacy alias argument, JSON, stderr deprecation, and exit contracts.

Add semantic tests for zero-write dry-run, deterministic planning, conflicts,
hash changes, interrupted promotion, rollback, stale approval, wrong publishing
target/locale/variant, changed metadata/artifacts, and mutation-seam isolation.

Run the directly affected test file first and follow the per-context limits in
`AGENTS.md`. After focused tests pass, run at most one affected-package
typecheck, targeted lint/diff checks, and narrowly scoped caller/writer searches.
Do not run broad release checks in this batch.

Create `docs/reports/codex-runs/2026-07-14-batch-12-migration-publish-approval.md`
with changed files, exact checks/results, risks, follow-ups, and current commit
hash. Update Batch 12 status only if every completion criterion passes. Confirm
that no paid provider, publishing, upload, remote render, or production data
migration ran.

