# Canonical Behavior Characterization

Task 01 freezes the observed behavior as evidence for extraction. “Canonical” below means the named current authority, not an endorsement for public API use. Evidence is the focused provider-free fixture and source-level path analysis; no provider or generated-output tree was executed.

## Provider-free profile evidence

- Dark Truth: `profile-contracts.unit.test.ts` traverses the full and Short DAG for every supported locale without provider calls. It separately asserts story-bible approval, canonical-fact constraints, reference-image coverage, continuity readiness, exact revision/hash bindings, and downstream invalidation.
- Mathematics: `profile-contracts.unit.test.ts` traverses all locale/full-Short/lesson-variant combinations without provider calls. It asserts reviewed curriculum revision, grade, difficulty/lesson variant, renderer and visual-style revisions, and the currently supplied narration-provider preset revision.
- The latter narration value is generic provider configuration, not a dedicated audio-preset contract. Treat a stable public audio-preset resource as an unresolved design requirement for Task 03 rather than inventing one from CLI configuration.

## Authority and normalized outcome matrix

| Operation     | Current authority                                                   | Normalized outcome                     | Classification                                       |
| ------------- | ------------------------------------------------------------------- | -------------------------------------- | ---------------------------------------------------- |
| Create/load   | CLI/filesystem manifests; SQLite is not operational authority       | created, loaded, malformed, missing    | Intentional legacy compatibility; requires migration |
| Generate      | Story CLI/localization; math canonical operator or pilot simulation | produced, cached, blocked, failed      | Unresolved: Dark Truth paths diverge                 |
| Localize      | Story commands/services; `math.localization` task                   | localized, repaired, blocked, failed   | Intentional profile behavior                         |
| Narration     | Speech commands/provider; `math.tts` task                           | generated, cached, blocked, failed     | Defect-risk: nested CLI bridge                       |
| Visual assets | Image commands/batches; math task                                   | generated, partial, retryable, failed  | Unresolved provider-batch recovery                   |
| Full render   | CLI/renderers; math task                                            | rendered, validated, failed            | Intentional worker boundary not yet extracted        |
| Short render  | Variant commands and math fixtures                                  | rendered, blocked, failed              | Blocked on end-to-end production evidence            |
| Thumbnail     | CLI/image pipeline                                                  | generated, validated, failed           | Intentional profile-owned behavior                   |
| Validate      | Profile gates and command reports                                   | passed, blocked, rewrite, failed       | Intentional semantics; envelope absent               |
| Repair        | Story repair, image retry, workflow retry                           | retried, invalidated, blocked, failed  | Unresolved policy normalization                      |
| Approve       | Review files, profile references, workflow approval                 | approved, rejected, revoked, stale     | Defect-risk: multiple authorities                    |
| Publish       | Legacy uploader; unused generic publisher                           | planned, uploaded, failed, uncertain   | Defect: accepted-before-checkpoint window            |
| Playlist      | YouTube upload child mutation                                       | added, failed, uncertain               | Defect-risk: no durable receipt                      |
| Batch         | Story/image manifests, coordinator, math scheduler                  | submitted, partial, resumed, cancelled | Defect-risk: multiple writable stores                |
| Resume        | Generic operator plus specialized paths                             | resumed, retryable, blocked, complete  | Unresolved: divergent resume guarantees              |

## Extraction constraints

- The generic workflow engine's resume, cache, approval, and attempt semantics are the candidate shared baseline.
- Dark Truth's provider-free DAG is structural only: supported task registrations remain unbound. It must not be advertised as executable until Task 06 binds the characterized semantics.
- Existing files remain the authority for legacy instances. Task 04 must establish one relational writer before any API-managed run is cut over.
- Publishing is not eligible for automatic retry when an external outcome is uncertain. Task 02 owns the provider-specific recovery proof.
- The full `profile-contracts.unit.test.ts` suite currently fails in its pre-existing offline simulation case because `M5-ZO-001` has stale curriculum identity. The new revision-binding assertion passes in isolation. This is classified as a production-content/curriculum defect, not a fixture update authorized by Task 01; the owning module is `number-operations-standard-content.ts`.
