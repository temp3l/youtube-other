# Execution Prompt - Task 01 Story-Localization Routing Test

You are working in the existing TypeScript pnpm monorepo.

Read and follow:

- `AGENTS.md`
- `packages/story-localization/AGENTS.md`
- `docs/plans/post-refactor-stability/tasks/task-01-story-localization-routing-test.md`

Goal:

Restore the focused story-localization routing coverage for the invariant:

```text
A localized full-story validation failure must not invoke short-story repair behavior.
```

Before editing:

- Inspect current repo state with `git status --short`.
- Inspect the failing test and current routing code before changing anything.
- Confirm the current failure with the exact focused test if it has not already been confirmed in this session.

Constraints:

- Make no paid provider calls.
- Use mocks/fakes only.
- Do not regenerate broad story, localization, short, batch, manifest, or cache fixtures.
- Do not weaken validation assertions.
- Avoid unrelated refactors.
- Commit only if the user explicitly asks.

Implementation requirements:

- Preserve the actual invariant, not just the first failure message.
- Prove full repair or full regeneration routing is used.
- Prove short repair routing is not used.
- Prove unrelated validation failures do not mask the intended fixture behavior.
- Keep assertions resilient to validator ordering where appropriate.
- Update the task document with implementation evidence only if that is the repository convention used by the session.

Focused validation:

```bash
pnpm test:focused -- packages/story-localization/src/story-localization.unit.test.ts -t "rejects localized full outputs that would require short-specific repair"
pnpm test:focused -- packages/story-localization/src/story-localization.unit.test.ts
pnpm --filter @mediaforge/story-localization typecheck
```

Stop and report if any stop condition in the task document is hit, especially if a paid provider call, fixture regeneration, weakened assertion, or unrelated architecture change would be required.

Final report:

- changed files
- tests run
- residual risks
- follow-up work
- confirmation that no paid calls were made
