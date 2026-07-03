# Execution Prompt - Tasks 02 And 03 Resolver Identity And Metadata

You are working in the existing TypeScript pnpm monorepo.

Read and follow:

- `AGENTS.md`
- `docs/plans/post-refactor-stability/tasks/task-02-resolver-cache-identity.md`
- `docs/plans/post-refactor-stability/tasks/task-03-resolver-metadata-propagation.md`

Goal:

Run Task 02 first, then Task 03 in the same session only if Task 02 is complete and validated. Task 02 corrects authored-script cache identity. Task 03 propagates resolver metadata downstream through a typed source descriptor.

Before editing:

- Inspect current repo state with `git status --short`.
- Inspect `packages/shared/src/episode-filesystem.ts` and `packages/shared/src/episode-filesystem.unit.test.ts`.
- Inspect `apps/cli/src/episode-commands.ts` and `apps/cli/src/episode-commands.unit.test.ts`.
- Search actual downstream consumers before changing package APIs.
- Inspect package dependencies before adding any import to avoid cycles.

Constraints:

- Make no paid provider calls.
- Do not reintroduce legacy source fallback.
- Do not change episode source layout.
- Avoid unrelated refactors.
- Do not pass many primitive arguments when a cohesive typed source descriptor is appropriate.
- Commit only if the user explicitly asks.

Task 02 requirements:

- Versioned source identity must include at least episode, language, variant, canonical relative path, content hash, and resolver/schema version.
- Identity must be deterministic for identical inputs.
- Identity must change when any relevant field changes.
- Old pathless identities must be explicitly invalidated.

Task 03 requirements:

- Preserve resolver metadata downstream where actual consumers need it.
- Inspect `apps/cli`, `packages/story-localization`, `packages/speech`, `packages/metadata`, and `packages/rendering`, but only modify actual consumers.
- Prefer a cohesive typed source descriptor with clear ownership.
- Review cache keys and structured logging.

Focused validation:

```bash
pnpm test:focused -- packages/shared/src/episode-filesystem.unit.test.ts
pnpm test:focused -- apps/cli/src/episode-commands.unit.test.ts
pnpm --filter @mediaforge/shared typecheck
pnpm --filter @mediaforge/cli typecheck
```

If actual consumer packages are changed, run the relevant typecheck:

```bash
pnpm --filter @mediaforge/story-localization typecheck
pnpm --filter @mediaforge/speech typecheck
pnpm --filter @mediaforge/metadata typecheck
pnpm --filter @mediaforge/rendering typecheck
```

Stop and report if any stop condition in either task document is hit, especially if a package dependency cycle, broad cache migration, or unrelated architecture change would be required.

Final report:

- changed files
- tests run
- residual risks
- follow-up work
- confirmation that no paid calls were made
