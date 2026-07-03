# Task 03 - Resolver Metadata Propagation

## Metadata

Task ID: Task 03  
Finding references: F4  
Severity: medium  
Dependencies: Task 02  
Can run in parallel with: Task 01, Task 04 before Task 04 touches shared validation reports  
Must not run concurrently with: Task 02 in a separate worktree; Task 05 or Task 06 if they edit `apps/cli/src/episode-commands.ts` source metadata surfaces  
Likely affected packages: `@mediaforge/cli`, `@mediaforge/story-localization`, `@mediaforge/speech`, `@mediaforge/metadata`, `@mediaforge/rendering`, only where actual consumers exist  
Likely affected files: `apps/cli/src/episode-commands.ts`, `apps/cli/src/episode-commands.unit.test.ts`, and actual consumer files discovered during implementation  
Estimated risk: high  
Paid calls allowed: No

## Context

`resolveAuthoredScript` returns resolver metadata, but `resolveEpisodeLanguageSource` in `apps/cli/src/episode-commands.ts` currently collapses it to:

```text
{ sourceFile: resolved.absolutePath }
```

`prepareEpisodeLanguage` then passes only `sourceFile` into `buildEpisodeLoadResult` and includes only `sourceFile` in the summary. Downstream generated records use source hashes such as `sourceSha256`, but do not receive the resolver version, canonical relative path, or cache identity.

Relevant current consumers to inspect:

- `apps/cli/src/episode-commands.ts`
- `packages/story-localization`
- `packages/speech`
- `packages/metadata`
- `packages/rendering`
- `packages/dark-truth` as the current episode setup implementation used by CLI

## Problem Statement

Downstream artifact, review, metadata, logging, and cache behavior cannot distinguish resolver source identity from a raw file path. This weakens cache invalidation and observability after canonical source layout changes.

## Goals

- Introduce a cohesive typed source descriptor that preserves appropriate resolver metadata downstream.
- Avoid passing many unrelated primitive arguments.
- Thread resolver metadata only into actual consumers.
- Review cache keys and artifact manifests that currently rely only on source hash.
- Add structured logging fields without logging authored content.

## Non-Goals

- Do not redesign the entire episode pipeline.
- Do not add dependency edges from low-level packages to higher-level CLI packages.
- Do not pass metadata to packages that are not actual consumers.
- Do not add broad refactors or unrelated manifest rewrites.
- Do not make provider calls.

## Required Implementation Analysis

Before editing:

- Confirm Task 02 identity shape has landed.
- Inspect `resolveEpisodeLanguageSource`, `prepareEpisodeLanguage`, `setupInputFromOptions`, and use-case wrappers in `apps/cli/src/episode-commands.ts`.
- Inspect tests in `apps/cli/src/episode-commands.unit.test.ts`.
- Search for actual source consumers in `packages/story-localization`, `packages/speech`, `packages/metadata`, and `packages/rendering`.
- Inspect package dependencies to avoid cycles. Current dependency direction allows `apps/cli` to depend on all packages; `@mediaforge/shared` has no workspace dependencies; `@mediaforge/domain` has no internal dependencies.
- Decide the ownership boundary for the source descriptor. Prefer a shared type in `@mediaforge/shared` if it is resolver-specific and dependency-free.

## Implementation Steps

1. Define or reuse a typed source descriptor that includes absolute path, canonical relative path, content hash, resolver version, and cache identity.
2. Update `resolveEpisodeLanguageSource` to return the descriptor while preserving a compatibility path field only if required by existing callers.
3. Update `prepareEpisodeLanguage` and direct CLI consumers to pass the descriptor or a narrowed source dependency object.
4. Update review/package outputs and summaries to include safe resolver metadata where useful.
5. Review downstream cache keys in story localization, speech, metadata, and rendering. Use the descriptor where cache invalidation depends on authored source identity.
6. Add structured logging fields for `episodeSlug`, `language`, `variant`, `relativePath`, `contentHash`, `resolverVersion`, and `cacheIdentity`.
7. Update tests to assert metadata propagation and no silent fallback to stale paths.

## Type-Safety Requirements

- No unnecessary `any`.
- No unsafe casts without justification.
- Prefer a readonly cohesive source descriptor.
- Use schema-derived types where schemas already exist.
- Use discriminated unions if source resolution can now report multiple states.
- Avoid wide optional bags whose fields are silently absent.

## Observability Requirements

Use structured fields where relevant:

- `episodeSlug`
- `language`
- `variant`
- `relativePath`
- `contentHash`
- `resolverVersion`
- `cacheIdentity`
- `artifactType`

Do not log authored scripts, provider secrets, or large manifest contents.

## Security And Path-Safety Requirements

- Continue using canonical path resolution from `resolveAuthoredScript`.
- Do not trust manifest paths without resolving under approved roots.
- Prevent path traversal and output-root escape.
- Do not add silent legacy fallback.
- No writes outside approved roots.

## Tests

Update or add tests for:

- `resolveEpisodeLanguageSource` returns descriptor metadata from `resolveAuthoredScript`.
- Canonical source path is still preferred.
- Stale authored-script resolver errors still surface.
- Missing canonical source still fails.
- Review/generation summaries include safe metadata if changed.
- Cache-key or artifact dependency changes invalidate on `cacheIdentity` or canonical relative path, not only content hash.

Existing tests to run:

- `apps/cli/src/episode-commands.unit.test.ts`
- Any package-specific focused test touched by the implementation.

## Validation Commands

```bash
pnpm test:focused -- apps/cli/src/episode-commands.unit.test.ts
pnpm test:focused -- packages/shared/src/episode-filesystem.unit.test.ts
pnpm --filter @mediaforge/cli typecheck
pnpm --filter @mediaforge/shared typecheck
```

If actual consumer packages are changed, also run the relevant package typecheck:

```bash
pnpm --filter @mediaforge/story-localization typecheck
pnpm --filter @mediaforge/speech typecheck
pnpm --filter @mediaforge/metadata typecheck
pnpm --filter @mediaforge/rendering typecheck
```

## Acceptance Criteria

- [ ] Downstream CLI source resolution preserves resolver metadata beyond file path.
- [ ] Actual consumers receive either the full source descriptor or a deliberately narrowed typed source dependency.
- [ ] Cache keys and artifact dependencies are reviewed and updated where source identity matters.
- [ ] Tests prove metadata propagation.
- [ ] No package dependency cycle is introduced.
- [ ] No paid provider calls are made.

## Stop Conditions

Stop and report if:

- The implementation would require a broad episode pipeline redesign.
- A package dependency cycle would be introduced.
- A downstream consumer needs metadata ownership that conflicts with Task 02 identity.
- Existing behavior contradicts the audit materially.
- Broad generated-file churn appears.
- Validation would require deleting or overwriting authored content.
- A paid provider call becomes necessary.

## Commit Guidance

Suggested message:

```text
fix(cli): preserve authored source resolver metadata
```

Include source descriptor propagation, directly related consumer changes, and focused tests. Do not include unrelated artifact schema migrations.
