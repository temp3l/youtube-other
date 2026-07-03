# Codex Implementation Prompt — Batch 02

Implement **Task 02 — Batch Types And Stable Identity** from:

- `docs/plans/cli-batch-images/tasks/task-02-batch-types-and-identity.md`

Prerequisite: Batch 01 must already be committed and passing.

Read:

- `docs/plans/cli-batch-images/batch-image-audit.md`
- Task 01 tests
- current batch types, schemas, planner, storage, service, and path resolvers


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

Introduce a deterministic, versioned, multi-language, multi-variant image asset identity without yet adding CLI commands or changing provider submission behavior.

## Required work

1. Design a canonical image asset identity that includes, where applicable:
   - episode;
   - language;
   - variant;
   - asset role;
   - operation;
   - scene or shot ID;
   - prompt hash;
   - model;
   - size;
   - quality;
   - dependency hashes;
   - canonical destination identity.
2. Model operations as a strict union such as generation, edit, and deterministic transform.
3. Model asset roles for full scenes, short scenes, character references, location references, object/prop references, reusable continuity assets, and thumbnails only where the current pipeline already supports them.
4. Derive `custom_id` and `identityHash` only from canonical normalized fields.
5. Make preparation order deterministic and independent of filesystem traversal order.
6. Reject duplicate identities, duplicate `custom_id` values, and duplicate destination paths.
7. Introduce a versioned v2 manifest/schema.
8. Keep v1 manifests readable through an isolated normalizer where feasible.
9. Update characterization tests intentionally; do not erase evidence of legacy limitations without replacing it with v2 coverage.
10. Add tests for:
    - full scene identity;
    - localized full scene identity;
    - short scene identity;
    - reference asset identity;
    - repeated deterministic preparation;
    - duplicate rejection;
    - v1 normalization.

## Design requirements

- Keep persisted representations explicit and schema-validated.
- Avoid unbounded free-form strings where repository enums or branded types are appropriate.
- Do not include timestamps, random IDs, or absolute machine-specific paths in stable identity.
- Separate stable identity from runtime lifecycle metadata.
- Ensure dependency hashes are normalized and sorted before hashing.

## Verification

Run all focused commands from Task 02 plus Task 01’s characterization suite.

## Commit

After acceptance criteria pass, create exactly one commit:

```text
feat(image-batch): add stable multi-variant asset identity
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
