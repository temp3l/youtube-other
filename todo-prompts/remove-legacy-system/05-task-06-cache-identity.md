# Codex Implementation Prompt

## Repository context

The implementation plan is located at:

```text
docs/plans/remove-legacy-and-normalize-paths/
```

Before changing code, read:

- `docs/plans/remove-legacy-and-normalize-paths/00-executive-summary.md`
- `docs/plans/remove-legacy-and-normalize-paths/16-risk-register.md`
- `docs/plans/remove-legacy-and-normalize-paths/18-implementation-order.md`
- `docs/plans/remove-legacy-and-normalize-paths/19-final-cleanup-checklist.md`
- every task file assigned in this prompt
- `AGENTS.md` and all repository-local instruction files

## Operating rules

Act as a senior TypeScript monorepo engineer performing a production-critical refactor.

- Work only on the tasks assigned in this prompt.
- Preserve active Dark Truth full-video and Short behavior.
- Keep strict TypeScript safety; avoid `any`, unsafe casts, duplicated schemas, and unvalidated path strings.
- Do not make paid OpenAI, image, speech, transcription, rendering, or other provider calls.
- Use mocks, fixtures, dry runs, and deterministic local tests.
- Do not weaken assertions or delete tests merely to make the suite pass.
- Do not update unrelated dependencies or reformat unrelated files.
- Do not delete production data.
- Do not silently resolve divergent files, ambiguous paths, external contracts, or migration collisions.
- Respect every human-review or rollout gate in the task documents.
- Inspect current code and searches before trusting assumptions in the plan.
- Do not commit unless repository instructions explicitly require it.

## Required workflow

1. Check the current branch and working tree.
2. Read all assigned task documents and relevant architecture documents.
3. Search for all affected imports, call sites, tests, fixtures, configuration, and documentation.
4. Write a concise implementation checklist in the Codex session.
5. Implement in the sequence specified below.
6. Run focused validation after each phase.
7. Stop rather than guessing when a stated approval or manual-review gate is missing.

## Final report

Report:

- files changed;
- behavior preserved and intentionally changed;
- validation commands and outcomes;
- searches performed and remaining matches;
- skipped checks and reasons;
- unresolved risks or required human decisions;
- the next safe task or batch.

# Task 06 — Cache and artifact identity

## Model recommendation

Minimum: GPT-5.4
Best: GPT-5.5

## Assigned task

- `docs/plans/remove-legacy-and-normalize-paths/tasks/06-update-cache-and-artifact-identity.md`

## Goal

Prevent language, variant, source-path, and source-content collisions after path normalization.

## Required identity

Create or reuse one deterministic resolver-backed identity containing:

- normalized episode;
- normalized language;
- variant;
- canonical relative script path;
- script content hash;
- resolver/schema version.

Use it consistently in active story-localization, speech, metadata, image-generation, rendering, resume state, and manifests.

## Safety requirements

- Old cache entries may become misses or stale.
- Never allow an unsafe legacy cache hit when identity cannot be proven.
- Do not delete old caches automatically.
- Prefer additive, migration-compatible manifest fields.
- Keep serialization deterministic.
- Avoid package-local duplicate cache-key algorithms.
- Log why a cache was invalidated or missed.
- Preserve active sync/batch image strategies and remote rendering.

## Execution order

1. Shared identity contract.
2. Story localization.
3. Speech.
4. Metadata.
5. Image generation.
6. Rendering and resume manifests.

Run focused tests and typecheck after each owner package.

## Validation

```bash
pnpm test:focused -- packages/metadata/src/youtube-metadata.unit.test.ts
pnpm test:focused -- packages/speech/src/narration-cache.unit.test.ts
```

Also run all affected package typechecks and focused tests.
