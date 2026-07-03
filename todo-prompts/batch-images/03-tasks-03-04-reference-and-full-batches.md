# Codex Implementation Prompt — Batch 03

Implement these tasks **sequentially in one Codex session**:

1. `docs/plans/cli-batch-images/tasks/task-03-reference-asset-stages.md`
2. `docs/plans/cli-batch-images/tasks/task-04-full-scene-batch-workflow.md`

Prerequisites: Tasks 01 and 02 must already be committed and passing.

Read the audit, both task files, current synchronous reference generation, character registry, batch planner, episode filesystem resolvers, localized scene loading, and installed OpenAI SDK batch types.


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


# Phase A — Task 03: Reference Asset Stages

## Goal

Represent references as first-class staged assets and make it impossible for reference-assisted scenes to silently degrade into text-only batch generations.

## Required work

1. Add staged planning for existing character references.
2. Add typed extension points for location, object/prop, and reusable continuity references without inventing unsupported data sources.
3. Model stage ordering:
   - reference prompt preparation;
   - reference image availability/generation;
   - approval validation;
   - dependent scene prompt preparation;
   - dependent scene image request preparation.
4. Persist dependency identity, source path, SHA-256, role, and approval status.
5. Carry normalized dependency hashes into dependent scene identity.
6. Select generation versus edit operation explicitly.
7. Verify the installed SDK supports the target batch endpoint at the type level.
8. Verify the actual JSONL body shape from primary repository/SDK evidence.
9. When reference-assisted edit request serialization cannot be proven safe, fail during preparation with a typed unsupported-operation error. Never silently fall back to `/v1/images/generations`.
10. Keep text-only scenes on `/v1/images/generations`.
11. Add structured errors for missing, unapproved, stale, or unsupported references.
12. Add request-count previews per stage.

## Task 03 verification and commit

Run Task 03’s focused tests plus the identity tests.

Commit before starting Task 04:

```text
feat(image-batch): stage reference assets before scenes
```

Do not start Task 04 if Task 03 acceptance criteria fail.

# Phase B — Task 04: Full Scene Batch Workflow

## Goal

Prepare deterministic full-video image batches across selected languages using canonical resolvers, staged references, stable identities, and canonical output paths.

## Required work

1. Accept selected episode, languages, and `full` variant.
2. Load localization, scene plans, prompts, manifests, references, and destinations through canonical resolvers.
3. Prepare missing prompt artifacts locally without provider calls.
4. Reuse a valid existing asset only when all identity-relevant hashes and settings match.
5. Group request lines by compatible endpoint and request model.
6. Generate immutable deterministic manifests and JSONL.
7. Split jobs deterministically when configured limits are exceeded.
8. Ensure split boundaries and local batch IDs remain stable for unchanged inputs.
9. Include request count, model, size, quality, operation, language, and stage summaries.
10. Reject missing plans/prompts/dependencies, duplicate IDs, duplicate destinations, unsupported operation/endpoint pairs, and path escapes.
11. Keep the existing synchronous generation path unchanged.

## Task 04 verification and commit

Run Task 04’s focused tests plus all Task 02–03 tests.

Commit:

```text
feat(image-batch): prepare full scene image batches
```

## Cross-phase checks

Before finishing, verify:

- every dependent scene has dependency hashes;
- no reference-assisted request is emitted as text-only generation;
- preparation performs no network calls;
- localized languages are not hard-coded to `en`;
- output paths are canonical and deterministic;
- the two commits remain separate and build on each other cleanly.


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
