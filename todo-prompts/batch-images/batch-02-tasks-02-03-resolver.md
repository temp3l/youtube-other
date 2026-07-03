# Codex Prompt — Batch 02: Resolver Identity and Metadata Propagation

You are working in the existing TypeScript pnpm monorepo.

Read and follow:

- `AGENTS.md`
- `docs/plans/post-refactor-stability/tasks/task-02-resolver-cache-identity.md`
- `docs/plans/post-refactor-stability/tasks/task-03-resolver-metadata-propagation.md`

Implement Task 02 first. Continue to Task 03 only after Task 02 focused tests and typecheck pass.

## Initial inspection

1. Run `git status --short`; preserve unrelated changes.
2. Inspect:
   - `packages/shared/src/episode-filesystem.ts`
   - `packages/shared/src/episode-filesystem.unit.test.ts`
   - `apps/cli/src/episode-commands.ts`
   - `apps/cli/src/episode-commands.unit.test.ts`
3. Search actual uses of:
   - `cacheIdentity`
   - `contentHash`
   - `sourceHash`
   - `sourceSha256`
   - `resolveEpisodeLanguageSource`
4. Inspect package dependencies before adding imports.

## Phase A — Task 02

Create a typed, versioned authored-script identity containing:

- episode ID/slug;
- language;
- variant;
- canonical repository-relative path;
- content hash;
- resolver/schema version.

Requirements:

- use a typed identity builder instead of duplicated string assembly;
- bump the version so old pathless keys cannot be reused;
- preserve branded/path types and readonly structures;
- preserve canonical path checks, realpath handling, stale-layout rejection, and path escape protection;
- add deterministic and field-invalidation tests.

Run before proceeding:

```bash
pnpm test:focused -- packages/shared/src/episode-filesystem.unit.test.ts
pnpm --filter @mediaforge/shared typecheck
```

If either fails, stop and report. Do not begin Task 03.

## Phase B — Task 03

Propagate the resolved source through a cohesive readonly typed descriptor. It should carry, as applicable:

- absolute path;
- canonical relative path;
- content hash;
- resolver version;
- cache identity;
- episode/language/variant identity.

Requirements:

- update `resolveEpisodeLanguageSource` and direct CLI consumers;
- retain a compatibility `sourceFile` projection only where a real existing caller requires it;
- modify only actual downstream consumers;
- review localization, speech, metadata, and rendering cache dependencies, but do not touch packages that do not consume the descriptor;
- avoid dependency cycles;
- use structured safe metadata in summaries/logging;
- never log authored content;
- do not introduce wide optional metadata bags or many primitive parameters.

## Constraints

- No paid provider calls.
- No legacy source fallback.
- No episode layout changes.
- No broad cache migration or deletion.
- No unrelated refactor.
- Do not commit unless explicitly requested.

## Final validation

```bash
pnpm test:focused -- packages/shared/src/episode-filesystem.unit.test.ts
pnpm test:focused -- apps/cli/src/episode-commands.unit.test.ts
pnpm --filter @mediaforge/shared typecheck
pnpm --filter @mediaforge/cli typecheck
```

Run typechecks for each additional consumer package actually changed.

## Stop conditions

Stop if:

- a dependency cycle would be introduced;
- old/new cache identities cannot be distinguished safely;
- metadata propagation requires a broad pipeline redesign;
- generated-file churn appears;
- authored content would need deletion/overwrite;
- paid execution is required.

## Final response

Report Task 02 and Task 03 separately:

- changed files;
- final identity contract and version invalidation;
- consumers updated and consumers deliberately left unchanged;
- tests/typechecks;
- residual risks;
- follow-up work;
- confirmation that no paid calls were made.
