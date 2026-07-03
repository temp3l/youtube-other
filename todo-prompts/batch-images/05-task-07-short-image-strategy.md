# Codex Implementation Prompt — Batch 05

Implement **Task 07 — Short Image Batch Strategy** from:

- `docs/plans/cli-batch-images/tasks/task-07-short-image-strategy.md`

Prerequisites: Tasks 01–06 must already be committed and passing.

Read the audit, short strategy, short scene planning, full-image manifests, batch planner, renderer inputs, and CLI prepare implementation.


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

Integrate short-video images into the generalized batch workflow while retaining free deterministic transforms wherever they are sufficient.

## Required work

1. Classify every short image into exactly one strategy:
   - native portrait generation;
   - direct reuse where valid;
   - deterministic conversion.
2. Preserve current safe transforms, including:
   - smart crop;
   - pan-and-scan metadata;
   - blurred fill;
   - other existing deterministic strategies proven by repository code.
3. Submit provider requests only for native generation items.
4. Represent deterministic transforms as typed local work items, never provider batch request lines.
5. Include language, short variant, asset role, narration/scene identity, source full-image hash, transform settings, output path, prompt hash, and dependency hashes.
6. Reuse existing valid portrait outputs only when source and configuration hashes match.
7. Preview separate counts for:
   - paid native generations;
   - free local transforms;
   - cache hits/reuse;
   - blocked/missing dependencies.
8. Integrate `--variants short` with the existing batch prepare CLI.
9. Do not force native generation for all scenes.
10. Fail clearly on missing source images, stale source hashes, duplicate portrait destinations, invalid portrait dimensions, or unsupported endpoints.
11. Keep the current synchronous/transform short workflow available.
12. Add tests for classification, native request preparation, exclusion of transform items from JSONL, cache reuse, language handling, and missing-source failure.

## Design requirements

- Policy decisions must be explicit and testable, not hidden in array position or incidental scene order.
- Deterministic transform identity must include source hash and transform parameters.
- Native short generation identity must remain distinct from full-image identity.
- Avoid duplicating short strategy rules between the existing short pipeline and batch planner; extract a shared pure planner where appropriate.

## Verification

Run Task 07’s focused tests plus planner, service, and CLI tests affected by short variant support.

## Commit

After acceptance criteria pass, create exactly one commit:

```text
feat(image-batch): support short image batch strategy
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
