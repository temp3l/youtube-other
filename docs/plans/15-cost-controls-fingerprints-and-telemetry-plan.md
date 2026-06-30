# Task 15: Cost Controls, Fingerprints, And Telemetry Plan

## 1. Scope And Non-Goals

Scope:

- Add centralized cost controls and observability for full and short variants.
- Ensure request fingerprints distinguish language, locale, variant, parent artifact hash, task, model, reasoning effort, output cap, compiler version, schema version, and short-contract version where relevant.
- Report costs and failures by language, locale, variant, and stage.
- Prevent unchanged expensive retries through fingerprint suppression.

Non-goals:

- Do not change `.env` precedence or introduce redundant environment settings without tests and justification.
- Do not replace provider routing or model config ownership.
- Do not implement cache/resume invalidation; Task 16 owns artifact cache keys and invalidation.
- Do not make paid API calls.

## 2. Confirmed Repository Findings

- `story-generation-preflight.ts` already owns deterministic token preflight, request fingerprints, cost ceiling checks, and duplicate failed request suppression.
- `story-localization.cost-tracker.ts` estimates token costs using pricing, input tokens, cached input tokens, and output tokens.
- `short-rewrite.service.ts` records token usage and estimated cost per short artifact.
- `canonical-full-story.persistence.ts` records preflight, usage, estimated cost, prompt, model, schema, validation, and status for canonical English full artifacts.
- CLI execution telemetry exists in `apps/cli/src/index.ts`.
- Runtime config in `packages/config/src/index.ts` already defines story, localization, short, validator, metadata, and speech model settings with `MEDIAFORGE_` precedence over legacy names.

## 3. Dependencies And Assumptions From Tasks 08-10

- Task 08 finalizes localized full lineage, locale, model config, and parent canonical hash fields.
- Task 09 finalizes short contract version/hash and parent full-story hash.
- Task 10 finalizes short prompt compiler version, schema version, prompt hash, and artifact status/usage fields.
- Task 12 provides failed/incomplete response metadata that Task 15 aggregates.

## 4. Target Architecture And Ownership

- `story-generation-preflight.ts` owns request fingerprint composition and preflight cost-ceiling blocks.
- `story-localization.cost-tracker.ts` owns cost normalization and token cost calculations.
- Telemetry summary helpers own grouping by `language/variant`, locale, stage, status, and failure reason.
- Artifact persistence modules store per-artifact usage/cost; Task 15 aggregates but does not own artifact cache validity.

## 5. File-By-File Change Plan

- `packages/story-localization/src/story-generation-preflight.ts`: extend fingerprint payload only where final Tasks 08-10 fields are missing, especially parent hash and short-contract version/hash.
- `packages/story-localization/src/story-localization.cost-tracker.ts`: add grouping helpers for full generation, localization, short generation, localized short generation, repair, metadata, audio, failed calls, and token exhaustion.
- `packages/story-localization/src/story-localization.service.ts`: emit stage/variant cost events for full/localized full and repair without changing provider routing.
- `packages/story-localization/src/short-rewrite.service.ts`: emit stage/variant cost events for canonical/localized short and short repair.
- `apps/cli/src/story-localization-commands.ts`, `story-full-rewrite-command.ts`, and `story-short-rewrite-command.ts`: surface summaries without changing command names.
- Tests: add fingerprint, cost ceiling, duplicate failed request, failed-call cost, and grouping tests.

## 6. Compatibility And Migration

- Preserve existing pricing model inputs and null-cost behavior when pricing is unavailable.
- Preserve current runtime config precedence: CLI overrides, episode overrides, `.env`, `process.env`, and `MEDIAFORGE_` names before legacy names as currently implemented.
- Add telemetry fields additively to existing reports and artifacts.
- Do not alter cache keys in a way that invalidates artifacts before Task 16 owns that migration.

## 7. Tests And Verification Commands

- `pnpm test:unit -- packages/story-localization/src/story-generation-preflight.unit.test.ts`
- `pnpm test:unit -- packages/story-localization/src/story-localization.unit.test.ts`
- `pnpm test:unit -- packages/story-localization/src/short-rewrite.service.unit.test.ts`
- `pnpm test:unit -- apps/cli/src/story-localization-commands.unit.test.ts`
- `pnpm test:unit -- packages/config/src/index.unit.test.ts`

## 8. Ordered Implementation Steps

1. Verify final Tasks 08-10 fields for parent hash, short contract hash/version, compiler version, schema version, and prompt hash.
2. Verify Task 12 failed/incomplete metadata shape.
3. Extend preflight fingerprint payload additively for missing required dimensions.
4. Add cost grouping helpers by locale, variant, stage, failed calls, and token exhaustion.
5. Wire cost events from full, short, repair, metadata, and audio stages where stage owners expose usage.
6. Add cost ceiling tests that block before provider calls.
7. Add CLI summary tests for per full video, short video, locale, and episode totals.

## 9. Risks

- Fingerprint churn can cause unnecessary regeneration; keep payload deterministic and scoped to request identity.
- Missing pricing must not bypass cost ceiling silently; current preflight warns when a ceiling exists without pricing.
- Telemetry aggregation can double count repair or failed calls; track attempt stage and final artifact separately.

## 10. Acceptance Criteria

- Cost ceilings are variant-aware.
- Telemetry can answer cost per full video, short video, episode, and locale.
- Fingerprints prevent unchanged expensive retries.
- Failed calls and token exhaustion are reported by variant.
- Fingerprints change when variant or parent hash changes.

## 11. Post-Task-10 Verification Checklist

- Confirm final parent artifact hash field for full and short.
- Confirm final short-contract version/hash fields.
- Confirm final prompt compiler version and schema version fields.
- Confirm final model config and reasoning effort fields by generation purpose.
- Confirm final failed/incomplete request status and usage fields from Task 12.
