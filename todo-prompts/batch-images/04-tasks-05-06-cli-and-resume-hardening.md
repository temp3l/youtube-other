# Codex Implementation Prompt — Batch 04

Implement these tasks **sequentially in one Codex session**:

1. `docs/plans/cli-batch-images/tasks/task-05-batch-lifecycle-cli.md`
2. `docs/plans/cli-batch-images/tasks/task-06-reconciliation-validation-resume.md`

Prerequisites: Tasks 01–04 must already be committed and passing.

Read both task files, the audit, current CLI registration conventions, runtime config, batch service/storage, v1/v2 manifest normalization, and focused tests.


## Global execution rules

- Work from the repository root.
- Read the audit and relevant task files before modifying code.
- Inspect the current implementation; do not blindly implement the task description if repository state has changed.
- Use the canonical non-legacy pipeline.
- Keep synchronous image generation operational unless a task explicitly replaces a path.
- Do not make real OpenAI calls, upload batch files, submit batches, or generate paid images.
- Do not read, log, or expose secrets, API keys, signed URLs, or credentials.
- Use mocked clients, temporary directories, and narrow fixtures.
- Do not modify real episode assets.
- Preserve backward compatibility for existing manifests where the task requires normalization.
- Prefer strict TypeScript types, exhaustive discriminated unions, schema validation, deterministic ordering, atomic filesystem writes, and structured errors.
- Avoid broad refactors unrelated to the task.
- Run only focused tests and safe static checks.
- Do not weaken tests to make the implementation pass.
- Record pre-existing failures separately.
- Stop the batch if an acceptance criterion for an earlier task is not met.


# Phase A — Task 05: Batch Lifecycle CLI

## Goal

Expose a safe operator workflow for prepare, submit, status, download/import, and resume.

## Required work

1. Add an isolated `images batch` CLI module.
2. Register:
   - `prepare`;
   - `submit`;
   - `status`;
   - `download`;
   - `resume`.
3. Follow existing repository argument parsing and workspace resolution conventions.
4. Support stable `--json` output.
5. Resolve local batch IDs and remote provider batch IDs without ambiguity.
6. Ensure `prepare` is strictly local-only.
7. Ensure only explicit `submit` may upload or create a remote batch.
8. Reject submission for invalid, stale, duplicate, already-submitted, or unsupported manifests.
9. Print safe summaries:
   - episode;
   - languages;
   - variants;
   - stages;
   - local batch ID;
   - provider batch ID when present;
   - endpoints;
   - item counts;
   - retryable counts;
   - model/size/quality.
10. Never print secrets, signed URLs, raw auth headers, or unnecessarily large prompts.
11. Add command registration and mocked routing tests.

## Task 05 verification and commit

Run the focused CLI and batch service tests.

Commit:

```text
feat(cli): expose image batch lifecycle commands
```

Do not start Task 06 if the CLI safety rules are not proven by tests.

# Phase B — Task 06: Reconciliation, Validation, And Resume

## Goal

Make import and resume order-independent, idempotent, lineage-aware, and safe after partial failures.

## Required work

1. Reconcile output and error lines only by stable `custom_id`.
2. Detect and classify:
   - unknown IDs;
   - duplicate IDs;
   - missing results;
   - API failures;
   - policy rejection;
   - expired/cancelled batches;
   - invalid base64;
   - invalid MIME type;
   - invalid dimensions/aspect policy;
   - corrupt files;
   - stale dependencies;
   - destination conflicts.
3. Validate destination paths remain inside the episode workspace.
4. Preserve successful item state and output hashes across refresh, import, and retry.
5. Write imported files atomically and never treat partial files as valid.
6. Store per-item result details required by the task.
7. Preserve root and parent batch lineage across retries.
8. Prepare retries for retryable failed/missing/invalid items only.
9. Never resubmit successful or deterministic-transform-only items.
10. Make repeated `download`/import calls safe.
11. Return clear lifecycle outcomes such as imported, imported-with-failures, or non-terminal.
12. Print the exact number of paid retry requests before any explicit submit.
13. Maintain v1 compatibility through normalization.

## Task 06 verification and commit

Run Task 06’s focused tests plus CLI tests from Task 05.

Commit:

```text
fix(image-batch): harden reconciliation and resume
```

## Cross-phase checks

Verify with fake clients that:

- `prepare` makes no network calls;
- only `submit` uploads/creates;
- output order does not matter;
- repeated import is idempotent;
- retries exclude successful assets;
- CLI JSON output is stable;
- no real provider request can occur in tests.


## Final response

Report:

1. Files changed.
2. Behavior implemented.
3. Compatibility decisions.
4. Tests and checks run, with results.
5. Commits created.
6. Remaining risks or unresolved SDK/API uncertainties.
7. Whether the next batch is safe to start.

Do not claim success for untested or merely planned behavior.
