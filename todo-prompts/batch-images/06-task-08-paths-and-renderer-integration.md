# Codex Implementation Prompt — Batch 06

Implement **Task 08 — Paths And Renderer Integration** from:

- `docs/plans/cli-batch-images/tasks/task-08-paths-renderer-integration.md`

Prerequisites: Tasks 01–07 must already be committed and passing.

Read the audit, canonical episode filesystem code, full and short renderers, batch planner/importer, short strategy, and all path-related tests.


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


## Goal

Make all batch-generated, reference, and transformed image assets use canonical resolver-derived paths that renderers consume without ambiguity.

## Required work

1. Inventory current canonical and deprecated paths for:
   - full scene images;
   - short portrait images;
   - character/reference images;
   - batch JSONL inputs;
   - provider output/error files;
   - batch manifests;
   - validation reports.
2. Centralize or reuse resolver helpers for each category.
3. Remove new-code dependence on ad hoc string concatenation or output-path reverse derivation.
4. Ensure planner and importer use resolver-derived destinations.
5. Ensure full renderer resolves batch-generated full images.
6. Ensure short renderer resolves native-generated and locally transformed portrait images.
7. Make ambiguity deterministic and fatal rather than selecting an arbitrary match.
8. Reject traversal, absolute escape paths, symlink escape where relevant to existing filesystem abstractions, and destinations outside the episode workspace.
9. Store workspace-relative display paths for logs while retaining safe resolved paths internally.
10. Preserve compatibility reads for existing canonical assets; do not perform a broad filesystem migration.
11. Make CLI status report canonical manifest and asset directories.
12. Add tests for full, short, reference, traversal, ambiguity, and manifest/filesystem disagreement.

## Constraints

- Do not mutate real episode assets.
- Do not migrate or rename existing user files.
- Do not revive deprecated layouts.
- Keep resolver changes narrowly scoped and reusable.

## Verification

Run all focused commands from Task 08, then run affected planner, service, CLI, and short-strategy tests.

## Commit

After acceptance criteria pass, create exactly one commit:

```text
fix(image-batch): normalize asset paths for rendering
```


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
