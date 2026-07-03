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

# Tasks 09 + 10 + 16 — Remove entry points, pipeline, and build wiring

## Model recommendation

Minimum: GPT-5.5
Best: GPT-5.5 with high reasoning

## Assigned tasks

- `docs/plans/remove-legacy-and-normalize-paths/tasks/09-remove-legacy-entry-points.md`
- `docs/plans/remove-legacy-and-normalize-paths/tasks/10-remove-legacy-orchestration.md`
- `docs/plans/remove-legacy-and-normalize-paths/tasks/16-remove-legacy-dependencies-and-build-wiring.md`

These tasks may be batched only after Tasks 04 and 05 are complete and public command removal is approved.

## Precondition gate

Verify before deletion:

- active CLI/API/worker paths use application use cases;
- no active Dark Truth runtime depends on `@mediaforge/pipeline`;
- repository planning explicitly approves removal or approved aliases for `create`, `run`, `status`, `inspect`, `retry`, and `clean`.

If approval is missing, do not invent it. Report the blocked decision and stop before deleting public commands.

## Phase 1 — Remove legacy entry points

- Remove approved legacy registrations and handlers.
- Keep only explicitly approved aliases.
- Ensure aliases call application use cases, never low-level shortcuts.
- Replace API pipeline health with active application/config health.
- Update command tests and directly affected CLI documentation.

## Phase 2 — Remove legacy orchestration

- Prove imports are gone using repository searches.
- Delete `packages/pipeline` source and obsolete tests.
- Do not remove shared packages used by Dark Truth.
- Typecheck immediately after deletion.

## Phase 3 — Remove dependencies and build wiring

- Remove workspace dependencies, exports, TypeScript references, build/test wiring, and package filters.
- Update the lockfile only as necessary.
- Do not upgrade unrelated dependencies.

## Validation

```bash
rg "@mediaforge/pipeline|createPipeline" apps packages scripts
rg "@mediaforge/pipeline" package.json apps packages pnpm-lock.yaml tsconfig*.json
pnpm --filter @mediaforge/cli typecheck
pnpm --filter @mediaforge/api typecheck
pnpm test:focused -- apps/cli/src/index.unit.test.ts
```
