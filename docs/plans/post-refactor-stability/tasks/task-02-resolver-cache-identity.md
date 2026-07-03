# Task 02 - Resolver Cache Identity

## Metadata

Task ID: Task 02  
Finding references: F3  
Severity: medium  
Dependencies: none  
Can run in parallel with: Task 01, Task 04  
Must not run concurrently with: Task 03 in a separate worktree; other edits to `packages/shared/src/episode-filesystem.ts`  
Likely affected packages: `@mediaforge/shared`, downstream tests in `@mediaforge/cli` if identity shape is surfaced  
Likely affected files: `packages/shared/src/episode-filesystem.ts`, `packages/shared/src/episode-filesystem.unit.test.ts`, possibly `apps/cli/src/episode-commands.unit.test.ts`  
Estimated risk: medium  
Paid calls allowed: No

## Context

`resolveAuthoredScript` in `packages/shared/src/episode-filesystem.ts` returns a rich `ResolvedAuthoredScript` with:

- `episodeId`
- `language`
- `variant`
- `absolutePath`
- `relativePath`
- `contentHash`
- `cacheIdentity`
- `resolverVersion`
- `logContext`

The current `cacheIdentity` is built as:

```text
authored-script-resolver-v1:<episode>:<language>:<variant>:<contentHash>
```

It omits the canonical repository-relative path even though `relativePath` is returned separately. The current unit test in `packages/shared/src/episode-filesystem.unit.test.ts` asserts the pathless identity.

## Problem Statement

Two authored script sources with identical bytes can share a cache identity even if their canonical repository-relative paths differ after layout, resolver, or schema changes. Cache identity must distinguish source content and canonical source location.

## Goals

- Define a versioned authored-script source identity containing at least episode, language, variant, canonical relative path, content hash, and resolver/schema version.
- Make cache identity deterministic for identical inputs.
- Make cache identity change when any relevant identity field changes.
- Add an explicit old-cache invalidation strategy.
- Preserve path-safety and stale-layout rejection behavior.

## Non-Goals

- Do not reintroduce legacy authored-script fallbacks.
- Do not migrate or delete existing cache files as part of this task unless an implementation-local stale-read guard is required.
- Do not change episode source layout.
- Do not make provider calls.

## Required Implementation Analysis

Before editing:

- Inspect `authoredScriptResolverVersion`, `ResolvedAuthoredScript`, `authoredScriptRelativePath`, `staleAuthoredScriptRelativePaths`, and `resolveAuthoredScript` in `packages/shared/src/episode-filesystem.ts`.
- Inspect resolver tests in `packages/shared/src/episode-filesystem.unit.test.ts`.
- Inspect CLI resolver adapter tests in `apps/cli/src/episode-commands.unit.test.ts`.
- Search downstream cache usage for `cacheIdentity`, `sourceHash`, and `sourceSha256`.
- Decide whether to bump `authoredScriptResolverVersion` or introduce a separate schema version field. Prefer a clear version bump if cache identity string changes.

## Implementation Steps

1. Define the new identity shape in `packages/shared/src/episode-filesystem.ts`.
2. Include the canonical repository-relative path in the identity.
3. Include resolver/schema version in the identity, and bump the version so old pathless identities are stale.
4. Keep `relativePath` canonical and portable, using existing helpers instead of ad hoc string manipulation.
5. Update unit tests to assert the new shape and version.
6. Add tests that prove identity changes when episode, language, variant, canonical relative path, content hash, or resolver version changes.
7. Add tests that prove identical inputs produce identical identities.
8. Audit downstream cache keys that only use source hash and record follow-up requirements for Task 03 if they need richer source identity.

## Type-Safety Requirements

- No unnecessary `any`.
- No unsafe casts without local justification.
- Preserve branded/path types such as `RepositoryRelativePath`, `ScriptContentHash`, and resolver-specific version types.
- Use readonly objects for identity descriptors.
- Prefer a typed helper for building cache identities rather than duplicating string assembly.

## Observability Requirements

If `logContext` changes, include safe fields:

- `episodeSlug` or `episodeId`
- `language`
- `variant`
- `relativePath`
- `contentHash`
- `resolverVersion`
- `cacheIdentity`

Do not log authored script text.

## Security And Path-Safety Requirements

- Continue resolving canonical paths through `assertInsideWorkspace` and `fs.realpath`.
- Prevent path traversal and output-root escape.
- Do not trust paths read from manifests.
- Do not add silent legacy fallback.
- Do not write outside explicitly approved roots.

## Tests

Update or add tests in `packages/shared/src/episode-filesystem.unit.test.ts` for:

- New identity shape includes canonical relative path.
- Identity changes when content changes.
- Identity changes when language or variant changes.
- Identity changes when canonical relative path changes.
- Identity is deterministic for identical input.
- Stale layout still rejects stale candidates.
- Path escape protection still rejects escaping symlinks or invalid requests.

If downstream tests expose the old identity, update them to assert the versioned identity contract.

## Validation Commands

```bash
pnpm test:focused -- packages/shared/src/episode-filesystem.unit.test.ts
pnpm test:focused -- apps/cli/src/episode-commands.unit.test.ts
pnpm --filter @mediaforge/shared typecheck
```

## Acceptance Criteria

- [ ] Authored-script cache identity includes episode, language, variant, canonical relative path, content hash, and resolver/schema version.
- [ ] Old pathless cache identities are explicitly invalidated by versioning or stale-read handling.
- [ ] Resolver tests cover deterministic and invalidating identity changes.
- [ ] Stale layout and path-safety behavior remain covered.
- [ ] No package dependency cycle is introduced.
- [ ] No paid provider calls are made.

## Stop Conditions

Stop and report if:

- Fixing identity requires unrelated architecture changes.
- A package dependency cycle would be introduced.
- Existing cache readers cannot distinguish old and new identities safely.
- Existing behavior contradicts the audit materially.
- Broad generated-file churn appears.
- Validation would require deleting or overwriting authored content.
- A paid provider call becomes necessary.

## Commit Guidance

Suggested message:

```text
fix(shared): include authored script path in resolver identity
```

Include resolver identity code, focused resolver tests, and only directly required downstream test updates.
