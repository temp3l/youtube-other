# Codex Implementation Prompt — Batch 07

Implement **Task 09 — Operator Docs And Smoke Verification** from:

- `docs/plans/cli-batch-images/tasks/task-09-operator-docs-and-smoke-verification.md`

Prerequisites: Tasks 01–08 must already be committed and passing.

Read the final merged implementation, the original audit, existing batch/endpoint/development docs, CLI help output, schemas, manifests, and tests.


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

Create accurate final documentation for the implemented workflow and perform safe smoke verification without provider calls.

## Required work

1. Create or update `docs/cli-batch-images.md`.
2. Update `docs/plans/cli-batch-images/batch-image-audit.md` from partial-state audit to final evidence-based status.
3. Document only commands and behavior that exist in the merged code.
4. Clearly mark any residual proposed behavior as not implemented.
5. Include:
   - overview and support matrix;
   - full versus short strategy;
   - reference stage semantics;
   - lifecycle commands and options;
   - network/cost behavior per command;
   - lifecycle states;
   - sanitized JSONL request examples for each supported operation;
   - sanitized v2 manifest examples;
   - identity and dependency rules;
   - canonical output paths;
   - deterministic batch splitting;
   - prepare, submit, status, download/import, and resume examples;
   - validation and recovery behavior;
   - observability fields;
   - security and cost controls;
   - tests;
   - troubleshooting;
   - known limitations.
6. Include a Mermaid end-to-end flow covering localization, planning, references, preparation, submission, lifecycle, reconciliation, validation, full rendering, short native generation, local transforms, and short rendering.
7. Verify every documented command against actual CLI help/registration.
8. Verify every documented path against resolver code.
9. Correct older docs that materially overstate image batch readiness, but avoid unrelated documentation rewrites.
10. Record safe smoke-verification results.

## Smoke verification

Run the task’s focused tests and documentation checks. You may run CLI `--help` and prepare-only commands against temporary fixtures. Do not submit, upload, poll real provider state, or generate assets.

If a docs command does not exist in the repository, report that and use the nearest safe available validation rather than inventing a script.

## Commit

After acceptance criteria pass, create exactly one commit:

```text
docs(image-batch): document CLI batch image workflow
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
