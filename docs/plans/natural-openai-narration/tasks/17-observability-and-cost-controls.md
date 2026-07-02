# Task 17: Observability and Cost Controls

## Objective

Add structured logs, metrics, and cost-relevant counters for the narration pipeline.

## Rationale

OpenAI TTS cost and quality must remain auditable during batch processing and retries.

## Current Relevant Files and Symbols

- `packages/observability/src/telemetry.ts`: execution telemetry patterns.
- `packages/observability/src/pricing.ts`: pricing estimates.
- `packages/speech/src/index.ts`: current speech telemetry calls.

## Exact Files Likely Modified or Created

- `packages/speech/src/narration-telemetry.ts`
- `packages/speech/src/narration-telemetry.unit.test.ts`
- `packages/observability/src/telemetry.ts`
- `packages/speech/src/index.ts`

## Dependencies

Tasks 08 and 12.

## Implementation Steps

- Add narration event helpers.
- Record latency, attempts, cache hit rate, generated audio seconds, validation failures, and regeneration count.
- Add cost-relevant character and duration estimates.
- Ensure fallback usage is explicit in generation metadata.

## Types or Interfaces

`NarrationTelemetryEvent`, `NarrationCostEstimate`, `NarrationFallbackRecord`.

## Runtime Validation Requirements

Validate event fields and ensure secret-like fields are excluded.

## Error-Handling Behavior

Telemetry failures must not fail narration generation.

## Observability Requirements

This task owns required structured logging and metric fields.

## Performance Considerations

Telemetry should add negligible overhead and avoid large text payloads.

## Security Considerations

Redact API keys, auth headers, secrets, and full narration text.

## Test Requirements

`pnpm test:focused -- packages/speech/src/narration-telemetry.unit.test.ts`

## Acceptance Criteria

Logs and metadata expose cost drivers without leaking secrets.

## Explicit Non-Goals

No exact pricing table updates unless current repo pricing config already contains speech pricing.

## Rollback Considerations

Disable narration-specific telemetry while preserving core artifacts.

## Recommended Minimum Model

GPT-5 mini.

## Recommended Best Model

GPT-5.

## Parallelization

Parallel-safe with Tasks 14, 15, and 16 after dependencies.
