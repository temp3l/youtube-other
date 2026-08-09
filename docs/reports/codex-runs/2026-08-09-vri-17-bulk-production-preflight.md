# VRI-17 bulk production preflight

Date: 2026-08-09

## Changed files

- `packages/workflow-engine/src/bulk-preflight.ts`
- `packages/workflow-engine/src/bulk-preflight.unit.test.ts`
- `packages/workflow-engine/src/index.ts`

## Checks run

- `pnpm test:focused -- packages/workflow-engine/src/bulk-preflight.unit.test.ts` — passed (3 tests).
- `pnpm --filter @mediaforge/workflow-engine typecheck` — passed.

## Result

Added a versioned, provider-independent canonical Veronica bulk-preflight contract and durable store. It normalizes the legacy alias before identity construction, records revision/configuration/dependency/provenance fingerprints, enforces item and cost admission limits while persisting concurrency/rate limits for the queue, preserves cache-compatible items, and isolates blocked episodes with redacted evidence. Repeated equivalent plans reuse immutable evidence; conflicting limits fail closed. Aggregate review keeps every episode defect visible. Resume is authorized, read-only, and never dispatches providers.

## Risks and follow-up

This is a preflight-only capability. CLI/API adapters and any provider execution remain intentionally outside VRI-17's scope.
