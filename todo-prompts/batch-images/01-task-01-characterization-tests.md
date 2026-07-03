# Codex Implementation Prompt — Batch 01

Implement **Task 01 — Characterization Tests** from:

- `docs/plans/cli-batch-images/tasks/task-01-characterization-tests.md`

Also read:

- `docs/plans/cli-batch-images/batch-image-audit.md`
- existing image batch, synchronous image, reference-image, and short-image tests


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

Pin the current behavior before production changes. This batch must change tests and test fixtures only.

## Required work

1. Characterize the current full image batch JSONL request shape.
2. Prove the current identity and manifest limitations are English/full/scene-specific.
3. Prove that reference hashes may be tracked while reference image inputs are absent from current batch request lines.
4. Characterize synchronous reference-assisted generation and verify it selects image-edit semantics.
5. Characterize short-image classification and reuse for:
   - native regeneration;
   - smart crop;
   - blurred fill;
   - any currently supported pan-and-scan metadata.
6. Characterize reconciliation by `custom_id`, including out-of-order results where existing helpers support it.
7. Characterize existing error behavior for missing results, invalid dimensions, and reference approval failures where practical.
8. Use fake provider clients only.

## Constraints

- Do not change production behavior.
- Do not alter public types to make tests easier.
- Assertions documenting current limitations should be explicit and clearly named so later tasks can intentionally update them.
- Avoid brittle snapshots for large JSON objects; assert semantically important fields.

## Verification

Run the task document’s focused commands. Also run any narrower relevant test file discovered during inspection.

## Commit

After all acceptance criteria pass, create exactly one commit:

```text
test(image-batch): characterize current image workflows
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
