# VRI-21 failure recovery and observability

Date: 2026-08-09

## Changed files

- `packages/observability/src/workflow-recovery.ts`
- `packages/observability/src/workflow-recovery.unit.test.ts`
- `packages/observability/src/index.ts`
- `packages/application/src/durable-job-worker.ts`
- `packages/application/src/durable-job-worker.unit.test.ts`
- `packages/speech/src/creator-voice-policy.ts`
- `packages/speech/src/creator-voice-policy.unit.test.ts`

## Checks run

- `pnpm test:focused -- packages/application/src/durable-job-worker.unit.test.ts` — passed (7 tests).
- `pnpm test:focused -- packages/observability/src/workflow-recovery.unit.test.ts` — passed (2 tests).
- `pnpm test:focused -- packages/speech/src/creator-voice-policy.unit.test.ts` — passed (3 tests).
- `pnpm --filter @mediaforge/application typecheck` — blocked by pre-existing unresolved workspace package declarations and an existing localization alias comparison; no VRI-21 TypeScript errors remain.
- `git diff --check` — passed for changed implementation paths.

## Result

Added versioned recovery telemetry with deterministic correlations and bounded redaction. Durable failures redact secret-bearing evidence and emit outcome metrics without changing repository authority; exhausted retries are permanent. Veronica voice recovery retries/reconciles supplied media or requests manual replacement, never synthetic speech.

## Risks and follow-up

Application typecheck remains blocked by unrelated workspace build/declaration debt. The instrumentation hook requires composition wiring to publish events to a concrete telemetry sink.
