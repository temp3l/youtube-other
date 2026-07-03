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

# Tasks 02 + 03 — Canonical types and central resolver

## Model recommendation

Minimum: GPT-5.4
Best: GPT-5.5

## Assigned tasks

- `docs/plans/remove-legacy-and-normalize-paths/tasks/02-define-canonical-episode-domain-types.md`
- `docs/plans/remove-legacy-and-normalize-paths/tasks/03-introduce-central-script-resolver.md`

These tasks are safe to batch because the resolver should be implemented directly on the shared canonical types.

## Phase 1 — Canonical episode domain types

- Reuse `normalizeEpisodeId`, `normalizeLocaleCode`, `normalizeContentVariant`, and existing containment conventions.
- Define or refine types for episode slug/id, language, content variant, absolute path, relative path, and content hash.
- Add brands only where they prevent category errors without forcing unsafe casts.
- Preserve current public names until consumers are migrated.
- Continue rejecting legacy Spanish `sp`.
- Export supported types through `packages/shared/src/index.ts`.
- Do not create a second competing episode domain model.

## Phase 2 — Central authored-script resolver

Canonical source paths:

```text
episodes/<slug>/languages/script-<language>.md
episodes/<slug>/languages/short/script-<language>.md
```

Implement typed request, result, and error contracts. The resolver must:

- validate episode, language, variant, containment, existence, and regular-file type;
- reject traversal and unsafe symlink escape where applicable;
- never default to English;
- never create compatibility copies;
- inspect known noncanonical authored-script candidates;
- throw explicit ambiguity/conflict errors instead of silently selecting a file;
- return absolute path, repository-relative path, content hash, cache identity, resolver version, and structured log context;
- emit actionable errors for missing, invalid, ambiguous, stale-layout, and filesystem cases.

## Required tests

Cover:

- full and Short canonical resolution;
- episode 022 English and German;
- invalid episode/language/variant;
- `sp` rejection;
- traversal and containment;
- missing file;
- directory instead of file;
- identical and divergent stale candidates;
- deterministic hash and cache identity;
- absence of implicit English fallback.

## Validation

```bash
pnpm test:focused -- packages/shared/src/episode-filesystem.unit.test.ts
pnpm --filter @mediaforge/shared typecheck
```

Run any resolver-specific focused tests added.
