# Current Architecture

## Executive finding

- **Verified:** the repository can evolve to a shared application/workflow layer. `packages/workflow-engine/src/workflow-operator.ts:WorkflowOperator` is callable TypeScript with planning, execution, status, cache, retry, resume, invalidation, reconciliation, approvals, attempts, and locks. Canonical mathematics production binds implementations through `createMathProductionTaskImplementations` in `packages/math-education/src/orchestration/canonical-task-adapters.ts`.
- **Verified:** that layer is not yet canonical. Dark Truth production is largely imperative CLI orchestration, its generic task registrations are created with no implementations in `apps/cli/src/workflow-commands.ts`, and separate story/math/image/batch stores remain writable.
- **Verified:** `apps/api/src/index.ts:startApiServer` ignores the request and returns one JSON response containing the configured local workspace path. It is not a product API and must not be exposed.
- **Recommended:** extract tenant-aware typed application use cases around the generic workflow engine, then migrate the CLI and new adapters onto them one operation family at a time.

## Applications and packages

| Area            | Evidence                                                                    | Current role                                                       | API readiness                                           |
| --------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------- |
| `apps/cli`      | `apps/cli/src/index.ts`, command modules, `apps/cli/package.json`           | primary composition root and operational UI                        | unsafe as application boundary; preserve as adapter     |
| `apps/api`      | `apps/api/src/index.ts`                                                     | placeholder Node HTTP response                                     | replace behind contract/use cases                       |
| `apps/web`      | `apps/web/src/index.ts`                                                     | static HTML string                                                 | no operational relevance                                |
| workflow/domain | `packages/domain/src/workflow-contracts.ts`, `packages/workflow-engine/src` | strict schemas and strongest reusable orchestration                | migration anchor after repository/lease hardening       |
| Dark Truth      | `packages/dark-truth`, `story-localization`, image/speech/render packages   | typed profile plus imperative/specialized pipelines                | bind services as canonical tasks                        |
| mathematics     | `packages/math-education`, `math-rendering`, `educational-renderer`         | typed profile, canonical task adapters, separate renderer surfaces | closest to target; close approval/publish/Short gaps    |
| persistence     | `packages/persistence/src/index.ts`                                         | SQLite episode JSON table                                          | not current workflow authority                          |
| assets/state    | local episode/lesson trees and JSON/JSONL stores                            | effective authority for production                                 | transitional bridge only                                |
| publishing      | `packages/youtube-upload/src`                                               | legacy uploader plus stronger generic publisher                    | reuse ports/approval logic; replace durability boundary |
| observability   | `packages/observability/src`                                                | Pino and file execution/cost reports                               | adapt to distributed telemetry; separate audit          |

## Current dependency shape

```text
root scripts / CLI / renderer CLI / remote scripts
       ├─ CLI-owned orchestration
       ├─ specialized story/math/image workflow stores
       ├─ generic workflow operator (partially bound)
       └─ low-level domain/provider/render packages
                         ↓
            local files / SQLite / providers / YouTube
```

There is no durable queue, object-store adapter, tenant repository, authorization layer, public contract, outbox, or multi-worker state database evidenced in source.

## Workflow authorities

1. **Verified:** generic file workflow store under `<unit>/state/workflow/<workflow-id>` (`WorkflowStore`).
2. **Verified:** story manifest store under `<episode>/state/story-workflow/workflows` (`packages/story-localization/src/story-workflow-store.ts`); pipeline execution/resume surfaces are incomplete.
3. **Verified:** math legacy workflow manifest/pilot simulation plus canonical operator paths (`packages/math-education/src/orchestration/workflow.ts`, `pilot-simulation.ts`, CLI runtime).
4. **Verified:** image/story/math provider-batch manifests and specialized resume paths.
5. **Verified:** episode manifests and artifact files; SQLite save/load is not used by production command paths.

**Inferred:** concurrent CLI/API/worker writers cannot safely share these file authorities. An explicit per-workflow authority marker and single-writer migration are required.

## Current safety assets

Strict Zod contracts, content hashes, artifact lineage, atomic file writes, path/symlink containment, cache fingerprints, attributable hash-bound approvals, process argument arrays, renderer output checks, request-ID capture, and the generic YouTube mutation/checkpoint seam are valuable code to preserve.

They do not collectively provide tenant authorization, database transactions, cross-process compare-and-swap, durable dispatch, provider exactly-once behavior, or immutable actor audit.

## Diagram

See `diagrams/current-context.mmd`. Expanded evidence is retained in `workstreams/agent-a-repository-execution.md` and `workstreams/agent-b-workflow-infrastructure.md`.
