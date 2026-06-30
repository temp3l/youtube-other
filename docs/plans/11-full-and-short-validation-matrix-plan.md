# Task 11: Full And Short Validation Matrix Plan

## 1. Scope And Non-Goals

Scope:

- Implement variant-aware deterministic validation for full and short narration artifacts.
- Add optional semantic validation hooks that are testable with mocks and never required for offline validation.
- Add repository-named issue codes equivalent to the required full/short routing and short compression defects.
- Add matrix tests for `en`, `es`, `de`, `pt`, and `fr` where the current repo supports them.

Non-goals:

- Do not create duplicate variant, locale, lineage, parent-hash, short-contract, prompt-compilation, or validation abstractions from Tasks 08-10.
- Do not change CLI command names, artifact paths, provider routing, or `.env` precedence.
- Do not make paid API calls in tests.
- Do not implement repair routing; Task 12 owns that.

## 2. Confirmed Repository Findings

- `packages/story-localization/src/story-artifact-model.ts` already defines `StoryArtifactVariant`, artifact owners, `StoryIR`, and full/short output constraints.
- `packages/story-localization/src/generated-story-validator.ts` owns current full and mixed full/short validation, but issue reporting is string-based rather than typed.
- `packages/story-localization/src/short-rewrite.service.ts` has separate short-specific checks for word count, hook matching, thumbnail word count, production labels, and editorial commentary.
- Supported story languages are `en`, `de`, `es`, `fr`, and `pt` in `story-localization.types.ts`.
- `story-prompt-compiler.ts` already compiles full and short prompts with distinct variants and response schema descriptors.

## 3. Dependencies And Assumptions From Tasks 08-10

- Task 08 will finalize localized full lineage and locale validation fields.
- Task 09 will finalize short-source extraction and short-adaptation contract fields, including parent full-story hash and compression requirements.
- Task 10 will finalize short prompt compiler and generation artifact schemas, including short schema fingerprints and artifact paths.
- Treat all Tasks 08-10 APIs, schemas, manifests, hashes, issue codes, and artifact paths as provisional until verified after merge.

## 4. Target Architecture And Ownership

- `generated-story-validator.ts` owns the shared validation matrix, typed validation results, and issue-code taxonomy.
- Task 11 owns validation issue codes for full and short content defects.
- Full validation consumes `StoryIR`, full output constraints, canonical facts, language profile, locale, and final narration text.
- Short validation consumes the validated parent full artifact, short contract, parent hash, short output constraints, language profile, locale, and final short narration text.
- Optional semantic validation should be an injected interface or isolated adapter so deterministic tests remain offline.

## 5. File-By-File Change Plan

- `packages/story-localization/src/generated-story-validator.ts`: add typed validation issue objects, issue-code constants, full matrix checks, short matrix checks, and compatibility helpers that preserve existing string issue output where callers still expect strings.
- `packages/story-localization/src/generated-story-validator.unit.test.ts`: add full and short validation matrix tests across supported languages, including negative cases for short compression defects.
- `packages/story-localization/src/story-localization.service.ts`: adapt full/localized full validation calls to consume typed issues while preserving existing failure behavior.
- `packages/story-localization/src/short-rewrite.service.ts`: route short validation through the shared short validator after Task 10 artifacts are verified; keep local helper checks only as implementation details if still useful.
- `packages/story-localization/src/story-localization-batch-service.ts`: adapt batch import validation to typed issues without changing batch command behavior.
- `packages/story-localization/src/index.ts`: export new validation types only if existing public package exports require them.

## 6. Compatibility And Migration

- Preserve existing string issue messages during the transition by exposing message arrays or formatting helpers.
- Add typed codes alongside messages before changing any persisted artifact format.
- Keep legacy full/mixed story validation readable until Tasks 13 and 16 complete compatibility migrations.
- Do not invalidate existing artifacts only because typed issue fields were added; invalidation policy is Task 16.

## 7. Tests And Verification Commands

- `pnpm test:unit -- packages/story-localization/src/generated-story-validator.unit.test.ts`
- `pnpm test:unit -- packages/story-localization/src/story-localization.unit.test.ts`
- `pnpm test:unit -- packages/story-localization/src/short-rewrite.service.unit.test.ts`
- `pnpm test:unit -- packages/story-localization/src/story-localization.batch.integration.test.ts`

## 8. Ordered Implementation Steps

1. Verify merged Tasks 08-10 types, artifact paths, parent-hash fields, short contract fields, and validation issue conventions.
2. Add typed validation issue codes and result shapes in the existing validator module.
3. Implement full validation checks without applying any short hook, beat, or compression rules.
4. Implement short validation checks using parent full lineage and short contract inputs.
5. Add optional semantic validation seam with mocked tests only.
6. Adapt full, short, and batch callers while preserving current failure messages.
7. Add language/variant matrix tests and targeted regression tests for required issue codes.

## 9. Risks

- Validation can become too broad and duplicate prompt-contract ownership; keep semantic inputs read-only and reuse Tasks 08-10 contracts.
- Optional semantic validation can accidentally trigger paid calls; keep provider-backed validation disabled by default and test with mocks.
- Typed issue migration can break callers that expect strings; keep compatibility formatting until all callers are updated.

## 10. Acceptance Criteria

- Validators are variant-aware and testable.
- Short validation checks parent lineage and content compression defects.
- Full validation never applies short hook, beat, or compression rules.
- Required short issue-code equivalents are represented with repository naming.
- Matrix tests cover full and short variants across supported languages.

## 11. Post-Task-10 Verification Checklist

- Confirm final short contract type, schema version, path, and hash field.
- Confirm final parent full-story hash field and stale-parent behavior.
- Confirm final short artifact schema and final validated short narration path.
- Confirm final prompt compiler fingerprint, response schema fingerprint, and compiler version fields.
- Confirm final Tasks 08-10 issue-code naming so Task 11 extends rather than duplicates it.
