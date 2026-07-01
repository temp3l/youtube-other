# Task 12: Provider Batch Hybrid

## 1. Role And Context

You are integrating provider-side batches as an optional execution mode.

## 2. Required Repository Instructions

Use existing batch services. Mock OpenAI files/batches.

## 3. Objective

Group eligible workflow stages into provider batches, persist submissions, reconcile per-item results, and retry failed items independently.

## 4. Prerequisite Tasks

Tasks 03 and 08.

## 5. Authoritative Planning References

- Master plan "Strategy D".
- `story-pipeline-batch-strategy.md`.

## 6. Architectural Invariants

Provider batch never owns workflow correctness.

## 7. Exact Scope

Text/image batch integration. No TTS/render/publish batching.

## 8. Likely Files And Symbols

- `story-localization-batch-service.ts`.
- `story-localization-batch-storage.ts`.
- `image-batch-service.ts`.
- workflow batch adapter module.

## 9. Required Implementation Behavior

Submit grouped items, persist batch IDs, poll/reconcile, validate each item, mark per-item success/failure, create retry groups.

## 10. Required Types

`BatchSubmission`, `BatchItemState`, `ProviderBatchId`.

## 11. Required State Transitions

planned -> submitted -> completed/imported -> item persisted or failed.

## 12. Required Failure And Fallback Behavior

Expired/cancelled/failed batches leave retryable item states where appropriate.

## 13. Persistence Requirements

Workflow references existing local batch manifests and custom IDs.

## 14. Observability Requirements

Expose batch completion rate, per-item failure rate, provider IDs.

## 15. Backward-Compatibility Requirements

Existing `stories batch` commands remain.

## 16. Tests And Fixtures

Mixed batch output, schema-invalid item, failed item retry, expired batch, custom ID correlation.

## 17. Explicit Non-Goals

No batching where unsupported or latency-sensitive.

## 18. Parallelization Constraints

Can proceed with cost task after manifest store.

## 19. Commands To Run

```bash
pnpm test:focused -- packages/story-localization/src/story-localization.batch.integration.test.ts
pnpm test:focused -- packages/image-generation/src/image-batch-service.unit.test.ts
```

## 20. Acceptance Criteria

Failed batch items can be retried independently and workflow status remains correct.

## 21. Requested Commit Message

`feat(workflow): reconcile provider batch items`

## 22. Commit Instruction

Commit only this task.

## 23. Recommended Model

GPT-5.5 Medium, medium reasoning.
