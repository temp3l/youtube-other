# Task 04 - Shot-Plan Reproducibility

## Metadata

Task ID: Task 04  
Finding references: F1  
Severity: blocker  
Dependencies: none  
Can run in parallel with: Task 01, Task 02, early Task 03 inspection  
Must not run concurrently with: Task 05 or Task 06; other edits to `apps/cli/src/shots.ts` or visual-retention artifact contracts  
Likely affected packages: `@mediaforge/cli`, `@mediaforge/visual-planning`, `@mediaforge/shared`, `@mediaforge/domain`, possibly `@mediaforge/dark-truth`  
Likely affected files: `apps/cli/src/shots.ts`, `apps/cli/src/shot-commands.unit.test.ts`, `packages/visual-planning/src/shot-planner.ts`, `packages/visual-planning/src/shot-validation.ts`, `packages/shared/src/episode-filesystem.ts` if paths change  
Estimated risk: high  
Paid calls allowed: No

## Context

Episode 022 has authored scripts and generated scene artifacts, but no visual-retention artifacts under `episodes/022-the-whistler-in-the-woods/state/visual-retention`. The CLI command:

```bash
node apps/cli/bin/mediaforge.js shots validate --episode 022-the-whistler-in-the-woods --locale en --variant full --format json
```

exits 1 with a missing shot-plan artifact.

Relevant code:

- `resolveEpisodeShotPlanPath` and related helpers in `packages/shared/src/episode-filesystem.ts`.
- `planShotsCommand`, `validateShotsCommand`, `resolveShotsContext`, and `loadShotPlan` in `apps/cli/src/shots.ts`.
- `deterministicShotPlanner` and `serializeShotPlan` in `packages/visual-planning/src/shot-planner.ts`.
- `validateShotPlan` in `packages/visual-planning/src/shot-validation.ts`.
- `apps/cli/src/shot-commands.unit.test.ts` proves `shots plan` and `shots validate` use resolver-owned paths in temporary workspaces.

## Problem Statement

Visual-retention validation cannot prove readiness for `en/full`, `de/full`, `en/short`, and `de/short` because required shot-plan artifacts are missing and artifact ownership is unresolved. Validation needs reproducible, deterministic inputs and precise statuses.

## Goals

- Resolve shot-plan artifact ownership before generating or committing any episode artifacts.
- Make shot-plan validation reproducible without paid providers.
- Support the matrix: `en/full`, `de/full`, `en/short`, `de/short`.
- Define precise statuses: `valid`, `missing artifact`, `invalid schema`, `stale source identity`, `broken reference`.
- Prefer deterministic fixtures and temporary workspaces for tests.
- Ensure final visual-retention proof does not bypass the feature with `--no-visual-retention`.

## Non-Goals

- Do not generate paid AI images, narration, transcription, metadata, or video.
- Do not require paid AI generation for tests.
- Do not commit episode 022 shot plans until ownership is explicitly decided.
- Do not repair production findings outside shot-plan reproducibility.
- Do not add a monolithic cross-manifest validator; that belongs to Task 06.

## Required Implementation Analysis

Before editing:

- Inspect visual-retention artifact docs in `docs/plans/visual-retention-shot-architecture/architecture-plan.md` and `production-defaults.md`.
- Inspect `apps/cli/src/shots.ts` plan, validate, inspect, and migrate commands.
- Inspect `apps/cli/src/shot-commands.unit.test.ts`.
- Inspect `packages/visual-planning/src/shot-planner.ts`, `shot-validation.ts`, `legacy-shot-plan.ts`, and their tests.
- Inspect `packages/shared/src/episode-filesystem.ts` path helpers.
- Inspect episode 022 files only with targeted `find` commands. Do not search large generated trees broadly.
- Decide whether shot plans are committed source assets, reproducible derived artifacts, or ephemeral outputs.

## Implementation Steps

1. Document and implement the artifact ownership decision in code or task evidence.
2. Add or refine a zero-cost reproducibility path for shot plans, using `shots plan` or a fixture-backed planner path.
3. Ensure validation can report missing artifact, invalid schema, stale source identity, broken reference, and valid states without throwing only generic exceptions.
4. Add deterministic tests in temporary workspaces for all four language/variant cells.
5. Add stale source identity and broken reference fixtures using small local JSON/image artifacts.
6. Ensure paths use resolver-owned helpers and cannot escape the episode workspace.
7. If repository-owned episode artifacts are created, keep them limited, deterministic, reviewed, and clearly justified.

## Type-Safety Requirements

- No unnecessary `any`.
- No unsafe casts without justification.
- Use schema-derived types for shot plans, source scenes, focal metadata, and validation reports.
- Use discriminated unions for validation result states.
- Use stable typed validation codes instead of free-form status strings where possible.
- Preserve readonly result data.

## Observability Requirements

Where relevant, include structured fields:

- `episodeSlug`
- `language`
- `variant`
- `relativePath`
- `contentHash`
- `resolverVersion`
- `cacheIdentity`
- `artifactType`
- `validationCode`

Do not log large manifests or source script contents.

## Security And Path-Safety Requirements

- Resolve paths canonically under the episode workspace.
- Prevent path traversal and output-root escape.
- Do not trust paths from shot plans, source scenes, or manifests.
- No silent legacy fallback.
- No writes outside `state/visual-retention` or explicit temporary test roots.

## Tests

Update or add tests for:

- Deterministic shot-plan creation and reuse.
- `en/full`, `de/full`, `en/short`, and `de/short` validation cells.
- Missing shot-plan artifact.
- Invalid shot-plan schema.
- Stale source identity if source identity is added to shot artifacts.
- Broken source image or scene reference.
- Path escape attempts in source image paths or artifact paths.
- Determinism across repeated runs with identical inputs.

Existing tests to run:

- `apps/cli/src/shot-commands.unit.test.ts`
- `packages/visual-planning/src/shot-planner.unit.test.ts`
- `packages/visual-planning/src/shot-validation.unit.test.ts`
- `packages/shared/src/episode-filesystem.unit.test.ts` if path helpers change.

## Validation Commands

```bash
pnpm test:focused -- apps/cli/src/shot-commands.unit.test.ts
pnpm test:focused -- packages/visual-planning/src/shot-planner.unit.test.ts
pnpm test:focused -- packages/visual-planning/src/shot-validation.unit.test.ts
pnpm --filter @mediaforge/cli typecheck
pnpm --filter @mediaforge/visual-planning typecheck
```

After implementation, zero-cost CLI checks should include the four cells:

```bash
node apps/cli/bin/mediaforge.js shots validate --episode 022-the-whistler-in-the-woods --locale en --variant full --format json
node apps/cli/bin/mediaforge.js shots validate --episode 022-the-whistler-in-the-woods --locale de --variant full --format json
node apps/cli/bin/mediaforge.js shots validate --episode 022-the-whistler-in-the-woods --locale en --variant short --format json
node apps/cli/bin/mediaforge.js shots validate --episode 022-the-whistler-in-the-woods --locale de --variant short --format json
```

## Acceptance Criteria

- [ ] Artifact ownership is documented as committed asset, reproducible derived artifact, or ephemeral output.
- [ ] Shot validation supports the required four-cell matrix.
- [ ] Validation statuses distinguish valid, missing artifact, invalid schema, stale source identity, and broken reference.
- [ ] Tests use deterministic fixtures or temporary workspaces only.
- [ ] No paid provider assets are generated.
- [ ] Final proof does not use `--no-visual-retention`.

## Stop Conditions

Stop and report if:

- Repository ownership of generated shot plans remains unresolved.
- More than three production episode artifacts would need manual edits.
- A package dependency cycle would be introduced.
- Existing behavior contradicts the audit materially.
- Broad generated-file churn appears.
- Validation would require deleting or overwriting authored content.
- A paid provider call becomes necessary.

## Commit Guidance

Suggested message:

```text
fix(visual-planning): make shot plan validation reproducible
```

Include deterministic validation/status changes, focused tests, and any approved deterministic fixture artifacts. Do not include paid-provider output.
