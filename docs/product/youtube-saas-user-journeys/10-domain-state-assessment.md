# Domain-state assessment

## Existing models and sources

The repository has strong components, but no product aggregate named `EpisodeProductionState` or `ProductionRevision`. The closest current vocabulary is a **versioned episode/brief**, `episodeRevision` pinned in workflow admission, a durable **workflow run/job/step/attempt**, immutable asset/validation records, approval challenge/record, and publication intent/read state. Core evidence is `apps/api/src/contract.ts`, `packages/api-sdk/src/v1-contract.ts`, `packages/persistence/src/relational-workflow-state.ts`, `packages/persistence/src/postgres-workflow-repository.ts`, and `apps/api/src/postgres-durable-workflow-loader.ts`.

`database-v1` durable workflow authority is a canonical execution authority with guarded transitions. It is not a universal episode-production aggregate; legacy filesystem authority remains supported. The API and BFF currently compose project/episode, a run, steps/jobs, assets, validations, approvals, usage and publication reads. The UI is intentionally modest and contains pilot mappings (for example locale labels/profile setup), so it must not become the source of lifecycle truth.

## Assessment

State is **fragmented but typed in important areas**. Episode content/revision, workflow execution, artifact evidence, validation, approval, localization, rendering and publishing are represented independently. Current API reads do not provide one revision-centric projection that identifies the current production revision, its resolved configuration, all gates, available actions and links across all of those states. Cross-episode workflow and active-review queues are also absent.

The required product-level equivalent should be a backend/domain-owned, tenant-scoped read aggregate (using existing terms rather than forcing the suggested name) or an explicitly typed family of related resources. It must directly provide episode identity/current revision, workflow state, resolved/pinned configuration, artifact/validation/review/localization/render/publication states, blockers/warnings and allowed actions. Frontends must consume it; they must not infer it from filenames, job strings, artifact directories, or UI-local mappings.

## Gaps exposed by the corpus

1. No canonical revision-centric lifecycle/gate/action projection.
2. No explicit lifecycle distinct from run status.
3. No complete configuration-resolution provenance across platform, tenant/channel, genre, episode and pinned revision.
4. No full localization derivative/lineage and comparison projection.
5. Review validity is hash/revision-bound, but cross-artifact/config invalidation policy is incomplete.
6. Cross-project queues, batches and action center need bounded read models.
7. Publication has intent/recovery foundations but live mutation is deliberately disabled.
8. Provider/voice/capability state needs a unified typed registry rather than pilot UI maps.

This is an assessment, not an implementation design.
