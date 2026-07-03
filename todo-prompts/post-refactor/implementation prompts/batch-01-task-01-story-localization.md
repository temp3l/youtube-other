# Codex Prompt — Batch 01: Story-Localization Routing Coverage

You are working in the existing TypeScript pnpm monorepo.

Read and follow:

- `AGENTS.md`
- `packages/story-localization/AGENTS.md`
- `docs/plans/post-refactor-stability/tasks/task-01-story-localization-routing-test.md`

## Objective

Implement Task 01 and restore robust coverage for this invariant:

```text
A localized full-story validation failure must never invoke short-story repair behavior.
```

## Before editing

1. Run `git status --short` and preserve all unrelated user changes.
2. Inspect:
   - `packages/story-localization/src/story-localization.unit.test.ts`
   - `packages/story-localization/src/story-localization.service.ts`
   - `packages/story-localization/src/generated-story-validator.ts`
   - routing/telemetry helpers only if needed.
3. Run the exact currently failing focused test once.

## Implementation constraints

- No paid provider calls. Use mocks/fakes only.
- Do not regenerate fixtures or generated artifacts.
- Do not weaken production validation.
- Do not rely on the first validation message or issue ordering.
- Avoid production changes unless required to preserve the invariant.
- Do not commit unless explicitly requested.

## Required outcome

The test must prove all of the following:

- the localized full fixture fails for the intended full-story scenario;
- full repair or full regeneration routing is selected;
- no short-repair request label, prompt, telemetry stage, retry route, or output path is used;
- no localized short artifact is written;
- unrelated character-name or preservation errors do not mask the intended assertion.

Prefer typed request labels, telemetry fields, and issue collections over brittle message-string ordering.

## Validation

```bash
pnpm test:focused -- packages/story-localization/src/story-localization.unit.test.ts -t "rejects localized full outputs that would require short-specific repair"
pnpm test:focused -- packages/story-localization/src/story-localization.unit.test.ts
pnpm --filter @mediaforge/story-localization typecheck
```

## Stop conditions

Stop and report rather than expanding scope if:

- unrelated architecture changes are required;
- more than three unrelated fixtures appear stale;
- assertions must be weakened;
- broad fixture churn occurs;
- a paid call would be required.

## Final response

Report:

- changed files;
- behavior implemented;
- commands and results;
- residual risks;
- follow-up work;
- confirmation that no paid calls were made.
