# Target Architecture

## Dependency invariant

```text
CLI / REST controllers / workers / schedulers
                       ↓
          typed application commands and queries
                       ↓
        canonical workflow engine and policies
                       ↓
       profile/domain contracts and explicit ports
                       ↓
SQL / object storage / dispatch / AI / TTS / render / YouTube
```

Adapters validate transport concerns and call one use case. They do not assemble providers or execute pipeline stages. Workers claim durable work then call the same step handler used by synchronous test and CLI composition. Domain packages do not import HTTP, CLI, SQL, or provider SDK structures.

## Application boundaries

- `EpisodeUseCases`: create/read/revise typed Dark Truth or math production units.
- `WorkflowUseCases`: start, query, resume, cancel a high-level production run.
- `ApprovalUseCases`: present challenges and record/revoke hash-bound decisions.
- `PublicationUseCases`: create and reconcile one durable publication intent.
- `AssetUseCases`: prepare/complete validated uploads and authorize downloads.
- internal worker handlers: claim/heartbeat/complete attempts through ports.

Every command carries actor/workspace/permissions, request/correlation/causation IDs, idempotency command ID, deadline, and abort signal.

## Ports

Workflow/job/lease repository; event/outbox repository; asset repository; approval/validation repository; publication/effect journal; profile task registry; provider/TTS/image ports; render port; credential resolver; audit/usage sinks; clock and ID source.

No `any`, public path, raw provider payload, or arbitrary extension bag is used to bridge architectural gaps.

## Profile model

The shared public episode input is a versioned discriminated union. Profile adapters map it to the existing `dark-truth` and `mathematics-education` contracts. Generic orchestration handles lifecycle; each task registry owns domain validation and artifacts. V1 math remains grades 5–10 because `packages/math-education/src/domain/identity.ts` proves that narrower range.

## State and delivery

Relational current state is authoritative; append-only events retain history. Database jobs with fenced leases are the smallest reliable queue. Object storage is authoritative for new binary assets; a contained filesystem driver bridges legacy episodes. Compatibility files are projections only.

## Irreversible effects

Publishing is a separate, explicitly approved application command. The engine creates an immutable intent and effect records, rechecks approval/credentials/hashes at execution, serializes by channel, and fails closed on ambiguous provider outcomes.

## Deployment evolution

Begin as one codebase with API, scheduler, general worker, render worker, publish worker, and webhook roles. Split workflow control only when scale/failure isolation justifies the operational cost. See target diagrams.
