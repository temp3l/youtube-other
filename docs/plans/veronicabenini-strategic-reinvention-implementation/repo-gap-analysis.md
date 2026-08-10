# Repository gap analysis

| Capability | Status | Evidence | Disposition |
| --- | --- | --- | --- |
| Episode/revision/API admission | PARTIAL | `postgres-workflow-repository.ts:createEpisode`; API use cases | Extend canonical lifecycle; no Veronica store. |
| Mixed-source manifests and secure ingest | PARTIAL | `source-ingestion/content-source.ts`; `veronica-media/ingestion/secure-ingest.ts` | Unify source asset flow. |
| Artifact fingerprints/cache/invalidation | SHARED_REUSABLE | `workflow-engine/cache.ts:buildTaskFingerprint`; workflow store | Extend identity edges, not cache copies. |
| Narration/visual planning | PARTIAL | strategic source bridge; Veronica semantic planner | Remove fixture fallback and bind canonical tasks. |
| Localization/speech/review/render | PARTIAL | story localization; speech platform; review packs; FFmpeg renderer | Add revisioned Veronica adapters. |
| API/tenant/idempotency/retry/cost | SHARED_REUSABLE | API contract; admission; durable worker; usage ledger | Reuse shared operations. |
| Analytics | ABSENT | no production revision analytics projection | Add after publication. |

COMPLETE story evidence: `VER-082` idempotent admission, `VER-125` tenant isolation, `VER-131` durable retry, `VER-151` quota/budget ledger. Their primary tasks verify Veronica integration. The 16 ABSENT stories are marked in the coverage matrix; the remaining 61 are PARTIAL because existing foundations are not an end-to-end Veronica capability.

Critical refactor: `runStrategicEpisodePipeline` must cease swallowing source-adaptation errors and writing fixture scripts/audio/captions on production paths.
