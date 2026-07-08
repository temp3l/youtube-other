# Task 04: Type-Safety Cleanup

## Objective

Reduce unsafe casts and prevent secret leakage in process telemetry.

## Findings Addressed

CR-003, CR-017, CR-020.

## Files Likely To Inspect

`packages/process-runner/src/index.ts`, `packages/observability/src/telemetry.ts`, `packages/metadata/src/youtube-metadata.ts`, `packages/image-generation/src/openai-image.ts`, `packages/domain/src/index.ts`.

## Files Likely To Edit

Process runner, telemetry tests, and small boundary helpers.

## Implementation Steps

Redact sensitive args before recording telemetry. Replace `z.any()` with `z.unknown()` or typed schemas where consumed. Replace non-null assertions with explicit guards in touched files.

## Tests To Add/Update

Process telemetry tests proving `Authorization`, API keys, tokens, and secrets are redacted.

## Verification Commands

`pnpm test:focused -- packages/process-runner/src/index.unit.test.ts`
`pnpm test:focused -- packages/observability/src/telemetry.unit.test.ts`

## Risks

Telemetry snapshots or diagnostics may change; avoid weakening useful command context.

## Rollback Notes

Revert redaction helper and matching tests.

## Acceptance Criteria

Telemetry never persists bearer tokens or known secret arg values; boundary casts are reduced where touched.

## Parallelization Notes

Telemetry redaction can run in parallel with task 02 if files are disjoint.

