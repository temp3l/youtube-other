# Task 05 - Episode Validation Semantics

## Metadata

Task ID: Task 05  
Finding references: F5  
Severity: medium  
Dependencies: Task 04  
Can run in parallel with: Task 01 after Task 04 is complete  
Must not run concurrently with: Task 04 or Task 06; other edits to `apps/cli/src/episode-commands.ts` validation behavior  
Likely affected packages: `@mediaforge/cli`, possibly `@mediaforge/shared`, `@mediaforge/domain`, `@mediaforge/visual-planning`  
Likely affected files: `apps/cli/src/episode-commands.ts`, `apps/cli/src/episode-commands.unit.test.ts`, possibly proposed validation helper files under `apps/cli/src`  
Estimated risk: high  
Paid calls allowed: No

## Context

`commandEpisodeValidate` in `apps/cli/src/episode-commands.ts` currently delegates directly to dry-run:

```text
await commandEpisodeDryRun({ ...options, dryRun: true })
```

The command exits 0 for episode 022 and emits `"dryRun": true`, which means it describes planned work instead of validating existing artifacts.

Relevant current behavior:

- `commandEpisodeDryRun` calls `prepareEpisodeLanguage` with `dryRun: true`.
- `prepareEpisodeLanguage` parses the source and writes/returns planning-oriented output.
- CLI exit handling varies by surface: `apps/cli/src/shots.ts` sets `process.exitCode = 1` for invalid shots; `packages/speech/src/narration-pipeline.ts` has narration-specific exit codes.

## Problem Statement

`episode dry-run` and `episode validate` are not separate commands. Operators can receive green validation output even when existing artifact readiness has not been inspected.

## Goals

- Define and separate `episode dry-run` from `episode validate`.
- `dry-run` describes intended work.
- `validate` inspects existing artifacts and must not report itself as a dry-run.
- Produce a typed validation report with stable result states and typed validation codes.
- Validate canonical paths, schemas, language, variant, source identity, and legacy fallback attempts.
- Align exit behavior with existing CLI conventions after inspection.

## Non-Goals

- Do not run paid generation.
- Do not implement the full cross-manifest validator from Task 06.
- Do not remove dry-run behavior.
- Do not change command names unless existing CLI conventions require it.
- Do not rely on `--no-visual-retention` for final acceptance.

## Required Implementation Analysis

Before editing:

- Inspect `commandEpisodeDryRun`, `prepareEpisodeLanguage`, `commandEpisodeValidate`, and command registration in `apps/cli/src/episode-commands.ts`.
- Inspect `apps/cli/src/episode-commands.unit.test.ts`.
- Inspect `apps/cli/src/shots.ts` validation result and exit-code behavior.
- Inspect `packages/speech/src/narration-pipeline.ts` exit-code comments and result states.
- Inspect Task 04 validation statuses and artifact ownership.
- Inspect existing episode 022 artifact layout using targeted file reads only.

## Implementation Steps

1. Define a typed episode validation report for a single episode/language/variant.
2. Implement `episode validate` as read-only artifact inspection, not as `dryRun: true`.
3. Include checks for canonical authored source path, source hash or identity, artifact schemas, expected language, expected variant, required manifests, visual-retention status, and legacy fallback attempts.
4. Ensure validation report does not include `dryRun: true`.
5. Use stable validation codes and statuses.
6. Set exit code according to existing CLI conventions. If no global standard exists, use 0 for valid and 1 for invalid, matching `shots validate`.
7. Add focused tests for valid, missing artifact, stale source identity, wrong language, wrong variant, and path escape cases that are available at this layer.

## Type-Safety Requirements

- No unnecessary `any`.
- No unsafe casts without justification.
- Use discriminated unions for result states.
- Use schema-derived types for manifest parsing where schemas exist.
- Exhaustively handle validation states.
- Use stable typed error or validation codes.
- Keep report data readonly.

## Observability Requirements

Include structured report/log fields:

- `episodeSlug`
- `language`
- `variant`
- `relativePath`
- `contentHash`
- `resolverVersion`
- `cacheIdentity`
- `artifactType`
- `validationCode`

Do not log authored scripts, provider secrets, or large manifest contents.

## Security And Path-Safety Requirements

- Canonically resolve paths.
- Prevent path traversal and output-root escape.
- Do not trust paths read from manifests.
- Do not add silent legacy fallback.
- No writes outside explicitly approved validation report paths, if any.
- Prefer read-only validation; if reports are persisted, write only to an approved validation/report location.

## Tests

Update or add tests for:

- `episode validate` no longer delegates to dry-run.
- Valid fixture reports valid and does not include `dryRun: true`.
- Missing generation manifest or current artifact reports invalid.
- Wrong language reports invalid.
- Wrong variant reports invalid.
- Stale source identity reports invalid when identity is available.
- Legacy fallback attempt reports invalid.
- Path escape in manifest path reports invalid.
- Exit code is set for invalid validation.

Existing tests to run:

- `apps/cli/src/episode-commands.unit.test.ts`
- `apps/cli/src/shot-commands.unit.test.ts` if visual-retention validation integration changes.

## Validation Commands

```bash
pnpm test:focused -- apps/cli/src/episode-commands.unit.test.ts
pnpm test:focused -- apps/cli/src/shot-commands.unit.test.ts
pnpm --filter @mediaforge/cli typecheck
```

Zero-cost CLI cells after implementation:

```bash
node apps/cli/bin/mediaforge.js episode validate --episode 022-the-whistler-in-the-woods --language en --artifact full --json
node apps/cli/bin/mediaforge.js episode validate --episode 022-the-whistler-in-the-woods --language de --artifact full --json
node apps/cli/bin/mediaforge.js episode validate --episode 022-the-whistler-in-the-woods --language en --artifact short --json
node apps/cli/bin/mediaforge.js episode validate --episode 022-the-whistler-in-the-woods --language de --artifact short --json
```

## Acceptance Criteria

- [ ] `episode dry-run` remains planning-only.
- [ ] `episode validate` inspects existing artifacts.
- [ ] Validation output does not report `dryRun: true`.
- [ ] Validation uses stable typed statuses and codes.
- [ ] Invalid artifacts produce non-zero exit behavior consistent with CLI conventions.
- [ ] No paid provider calls are made.

## Stop Conditions

Stop and report if:

- Validation semantics require unrelated architecture changes.
- Exit-code conventions conflict and need an owner decision.
- A package dependency cycle would be introduced.
- Repository ownership of generated artifacts is unresolved.
- Existing behavior contradicts the audit materially.
- Broad generated-file churn appears.
- Validation would require deleting or overwriting authored content.
- A paid provider call becomes necessary.

## Commit Guidance

Suggested message:

```text
fix(cli): separate episode validation from dry-run planning
```

Include CLI validation semantics, focused tests, and any minimal helper types. Do not include Task 06 cross-manifest validator work.
