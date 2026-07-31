# Job and Workflow Model

## Distinction

- Job: asynchronous acceptance/execution handle for a command; a resume or cancel command may have its own job.
- Workflow run: durable orchestration of one workflow template over one episode revision.
- Step: domain task projection within a run.
- Attempt: immutable execution try for a step.
- Batch item: independently idempotent child command linked to a parent job.

## Public job states

```text
queued → running
          ├─ waiting_for_approval → running
          ├─ retry_scheduled → running
          ├─ cancelling → cancelled
          ├─ succeeded
          ├─ succeeded_with_warnings
          ├─ partially_succeeded
          ├─ failed
          └─ dead_lettered
```

`waiting_for_approval` and `retry_scheduled` are non-terminal. `partially_succeeded` and `dead_lettered` are terminal. Cache hits are successful step execution metadata, not a job state.

## Durable execution rules

1. Acceptance stores command/idempotency, job, workflow/run changes, and outbox in one transaction.
2. Workers claim jobs with renewable fenced leases. Attempts heartbeat; expiry marks them interrupted only after effect policy decides retry safety.
3. Declared task timeout/retry policy is enforced by the dispatcher/worker. Jittered retry stores next time and classification.
4. Cancellation is cooperative. Abort signals propagate to providers/processes; partial outputs remain quarantined. Irreversible uncertain effects cannot be represented as cancelled.
5. Resume keeps the workflow run, creates a job/new attempt, validates current fingerprints/artifacts/approval, and starts at the first invalid/interrupted retryable step.
6. Changed prompts/presets/code produce a new fingerprint and invalidate the dependent closure; resume never silently accepts stale outputs.
7. Partial batches retain succeeded items and retry only unresolved retryable items.
8. Terminally exhausted work enters a dead-letter record with operator-safe retry/reconcile actions.

## Progress

Expose named phase, completed/known step counts, and bounded messages. Render fan-out may expose completed/total scenes. Do not claim a percentage for provider latency or unknown future repair loops.

## Mapping existing contracts

Current domain task states and `WorkflowOperator` operations provide a strong semantic seed (`packages/domain/src/workflow-contracts.ts`, `packages/workflow-engine/src/workflow-operator.ts`). Target persistence adds transactional multi-worker authority; it does not expose internal task IDs publicly.

See `diagrams/workflow-sequence.mmd`.
