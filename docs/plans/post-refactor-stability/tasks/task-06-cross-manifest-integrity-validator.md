# Task 06 - Cross-Manifest Integrity Validator

## Metadata

Task ID: Task 06  
Finding references: F6  
Severity: high  
Dependencies: Task 03, Task 04, Task 05  
Can run in parallel with: none after implementation begins; inspection can overlap earlier tasks only  
Must not run concurrently with: Task 03, Task 04, Task 05, or any validation report contract edits  
Likely affected packages: `@mediaforge/cli` and possibly a proposed validation package; actual schema consumers in `@mediaforge/domain`, `@mediaforge/shared`, `@mediaforge/visual-planning`, `@mediaforge/image-generation`, `@mediaforge/speech`, `@mediaforge/metadata`, `@mediaforge/rendering`  
Likely affected files: `apps/cli/src/episode-commands.ts`, `apps/cli/src/episode-commands.unit.test.ts`, proposed validator files under `apps/cli/src` or a new package, package manifests only if a new package is justified  
Estimated risk: high  
Paid calls allowed: No

## Context

The repo has package-local schemas and validators:

- `scenePlanSchema` and media schemas in `packages/domain/src/index.ts`.
- `shotPlanSchema`, `visualSourceSceneSchema`, and shot validation in `packages/visual-planning`.
- Narration schemas in `packages/speech/src/narration-schemas.ts`.
- Metadata validation in `packages/metadata/src/youtube-metadata.ts`.
- Rendering schemas and validation errors in `packages/rendering/src/index.ts`.
- Authored source resolution in `packages/shared/src/episode-filesystem.ts`.

No current validator was found that checks references across manifests and artifacts for a full episode/language/variant.

## Problem Statement

Package-local validation can pass while cross-artifact references are broken: scene IDs, language/variant metadata, source identity, image paths, narration segments, render inputs, metadata, and checkpoint state can drift independently.

## Goals

- Add cross-manifest referential-integrity validation for artifacts that actually exist in the repository architecture.
- Avoid package dependency cycles.
- Build independent validators for artifact groups instead of one monolithic function.
- Wire the validator into `episode validate` after Task 05 semantics are stable.
- Cover path-safety and stale identity failures.

## Non-Goals

- Do not create or regenerate media artifacts.
- Do not call paid providers.
- Do not validate artifacts that do not exist in the current architecture.
- Do not weaken package-local schemas.
- Do not reintroduce removed legacy pipeline behavior.

## Required Implementation Analysis

Before editing:

- Inspect package dependency graph in `package.json` files. `@mediaforge/shared` must not import `@mediaforge/domain`; avoid placing domain-aware validation there.
- Inspect Task 03 source descriptor and Task 05 validation report types.
- Inspect actual artifact paths and schemas for authored source, rewrite/localization outputs, scene plans, visual or shot plans, image manifests, narration manifests, render manifests, metadata, and resume/checkpoint state.
- Inspect CLI episode 022 artifact layout with targeted `find`, excluding large generated trees.
- Decide placement: CLI-local validator, a new validation package, or an existing high-level package that already depends on required schemas without introducing cycles.

## Implementation Steps

1. Define a cross-manifest validation input: episode workspace, language, variant, and resolved source descriptor.
2. Define stable validation codes and result states compatible with Task 05.
3. Implement independent validators for artifact groups that exist: source identity, story/localization manifest, scene plan, visual/shot plan, image manifest, narration manifest, render manifest, metadata, and checkpoint/resume state where present.
4. Make every manifest path canonical and root-contained before reading.
5. Compare scene IDs, language, variant, source hash or source identity, schema versions, image paths, narration segment IDs, render references, and metadata source fields where schemas expose them.
6. Wire the aggregate report into `episode validate`.
7. Add fixture-based tests for valid and invalid cases.

## Type-Safety Requirements

- No unnecessary `any`.
- No unsafe casts without justification.
- Use schema-derived types for manifest parsing.
- Use discriminated unions for validator results.
- Exhaustively handle validation states.
- Use stable typed validation codes.
- Keep validators small and independently testable.

## Observability Requirements

Use structured fields:

- `episodeSlug`
- `language`
- `variant`
- `relativePath`
- `contentHash`
- `resolverVersion`
- `cacheIdentity`
- `artifactType`
- `validationCode`

Do not log authored scripts, provider secrets, full manifests, or generated story text.

## Security And Path-Safety Requirements

- Canonically resolve all paths.
- Prevent path traversal and output-root escape.
- Do not trust paths read from manifests.
- Do not silently fall back to legacy locations.
- No writes outside explicitly approved report roots.
- Treat unsupported schema versions as validation failures.

## Tests

Use small fixtures or temporary workspaces. Adjust exact cases to actual schemas found during implementation.

Required coverage:

- Valid `full/en`.
- Valid `short/de`.
- Missing referenced scene.
- Wrong language.
- Wrong variant.
- Stale source hash or source identity.
- Unsupported schema version.
- Path escape.
- Missing image asset.
- Unknown narration segment.

Additional cases where schemas support them:

- Shot plan references a missing source scene.
- Metadata references wrong source duration or scene count.
- Render manifest references a missing audio or image input.
- Resume/checkpoint state points outside the workspace.

Existing tests to run:

- `apps/cli/src/episode-commands.unit.test.ts`
- Any new focused validator test file.
- Relevant package schema tests only if package schemas change.

## Validation Commands

```bash
pnpm test:focused -- apps/cli/src/episode-commands.unit.test.ts
pnpm --filter @mediaforge/cli typecheck
```

If a new unit test file is added, run it directly:

```bash
pnpm test:focused -- apps/cli/src/<new-validator>.unit.test.ts
```

If schema packages are changed:

```bash
pnpm --filter @mediaforge/domain typecheck
pnpm --filter @mediaforge/speech typecheck
pnpm --filter @mediaforge/metadata typecheck
pnpm --filter @mediaforge/rendering typecheck
pnpm --filter @mediaforge/visual-planning typecheck
```

## Acceptance Criteria

- [ ] Validator placement avoids package dependency cycles.
- [ ] Validators inspect only artifacts that exist in the current architecture.
- [ ] Independent artifact-group validators are covered by tests.
- [ ] `episode validate` reports cross-manifest integrity failures with stable codes.
- [ ] Path escape, stale identity, wrong language, and wrong variant cases fail.
- [ ] No paid provider calls are made.

## Stop Conditions

Stop and report if:

- A package dependency cycle would be introduced.
- Actual manifest schemas contradict the planned validator cases materially.
- More than three fixtures need unrelated edits.
- The implementation would require broad architecture changes.
- Repository ownership of generated artifacts is unresolved.
- Broad generated-file churn appears.
- Validation would require deleting or overwriting authored content.
- A paid provider call becomes necessary.

## Commit Guidance

Suggested message:

```text
feat(cli): add cross-manifest artifact integrity validation
```

Include validator code, CLI integration, focused tests, and only necessary package manifest changes. Do not include media generation or broad fixture regeneration.
