# Tasks 11-16 Cross-Task Dependency Plan

## 1. Scope And Non-Goals

Scope:

- Coordinate Tasks 11-16 as one implementation batch after Tasks 08-10 merge.
- Define execution order, ownership boundaries, overlapping files, merge risks, and integration checkpoints.
- Assign ownership for new types, schemas, issue codes, fingerprints, manifest fields, cache keys, and invalidation rules.
- Identify safe parallelism and assertions deferred to Task 17.

Non-goals:

- Do not plan Tasks 17-19 beyond listing assertions deferred to Task 17.
- Do not implement any production code.
- Do not override Tasks 08-10 final APIs, schemas, manifests, hashes, issue codes, or artifact paths.

## 2. Confirmed Repository Findings

- Existing story-localization owners include `story-artifact-model.ts`, `story-prompt-compiler.ts`, `generated-story-validator.ts`, `story-generation-preflight.ts`, `canonical-full-story.persistence.ts`, short rewrite modules, cache, batch service, and cost tracker.
- Existing media owners include `packages/metadata`, `packages/speech`, `packages/image-generation`, `packages/rendering`, `packages/youtube-upload`, and `apps/cli` command surfaces.
- `apps/cli` is the primary operational surface and must preserve command compatibility.
- Current high-overlap story files are `story-localization.service.ts`, `short-rewrite.service.ts`, `story-prompt-compiler.ts`, `generated-story-validator.ts`, `story-generation-preflight.ts`, `story-localization-cache.ts`, `story-localization.schemas.ts`, and `short-rewrite.schemas.ts`.

## 3. Dependencies And Assumptions From Tasks 08-10

- Tasks 11-16 must start with a post-Task-10 verification pass.
- Provisional 08-10 surfaces: localized full lineage, short-source extraction, short contract, short prompt compiler, short generation route, parent hashes, manifest paths, issue codes, and artifact status fields.
- If Tasks 08-10 introduce types or schemas for variant, locale, lineage, parent hash, short contract, prompt compilation, or validation, Tasks 11-16 must extend those exact surfaces.

## 4. Target Architecture And Ownership

- Execution order: `11 -> 12 -> 13 and 14 -> 15 -> 16`.
- Task 11 owns full/short validation matrix and validation issue codes.
- Task 12 owns repair/regeneration routing, retry policy, incomplete-response status, and routing failure codes.
- Task 13 owns metadata/audio stage separation and narration cleanliness boundaries.
- Task 14 owns scene/image/render/publish stage boundaries and media dependency records.
- Task 15 owns request fingerprints, cost controls, cost grouping, and telemetry aggregation.
- Task 16 owns persistence manifests, cache keys, resume checks, compatibility readers, and invalidation rules.

## 5. File-By-File Change Plan

- `generated-story-validator.ts`: Task 11 primary owner; Task 12 may consume issue classifications but should not redefine them.
- `story-localization.service.ts`: Tasks 11, 12, 13, 15, and 16 overlap; sequence changes through the execution order and avoid parallel edits.
- `short-rewrite.service.ts`: Tasks 11, 12, 13, 15, and 16 overlap; sequence changes through the execution order and avoid parallel edits.
- `story-prompt-compiler.ts`: Task 13 owns narration prompt cleanliness checks; Tasks 11/15/16 consume prompt metadata only.
- `story-generation-preflight.ts`: Task 12 may extend duplicate-failure behavior; Task 15 owns fingerprint/cost dimensions; Task 16 consumes fingerprints for cache decisions.
- `story-localization-cache.ts`: Task 16 primary owner; earlier tasks should not change cache semantics beyond additive failed/incomplete metadata required by Task 12.
- `story-localization.schemas.ts` and `short-rewrite.schemas.ts`: Tasks 11-16 may need additive fields; final schema ownership must follow Tasks 08-10 and Task 16 persistence decisions.
- `apps/cli/src/index.ts` and `apps/cli/src/episode-commands.ts`: Task 14 primary owner for media-stage command compatibility; Task 15 may add summary output tests without command changes.

## 6. Compatibility And Migration

- Preserve CLI commands, artifact paths, compatibility readers, provider routing, and `.env` precedence across all tasks.
- Add fields and readers before requiring new fields for fresh cache hits.
- Do not remove legacy Markdown metadata/audio sections until compatibility adapters are tested.
- Do not treat failed or incomplete artifacts as successful resume candidates.

## 7. Tests And Verification Commands

- After Task 10 checkpoint: run narrow tests for Tasks 08-10 touched files and path-existence checks for finalized manifests.
- After Task 12 checkpoint: run targeted validation, routing, preflight, full service, short service, and batch retry tests.
- After Task 14 checkpoint: run prompt cleanliness, metadata/audio isolation, image strategy, rendering, upload, and CLI media tests.
- After Task 16 checkpoint: run cache/resume/invalidation tests plus targeted story localization and short rewrite integration tests.

## 8. Ordered Implementation Steps

1. Post-Task-10 verification: document final APIs, schemas, manifests, hashes, issue codes, artifact paths, and status fields.
2. Implement Task 11 validation issue codes and matrix.
3. Implement Task 12 purpose-aware routing, retries, incomplete-response persistence, and duplicate-failure suppression.
4. Implement Tasks 13 and 14 in parallel only if teams avoid shared persistence/schema edits and coordinate artifact-owner names.
5. Implement Task 15 fingerprints, cost ceilings, and telemetry aggregation after route/status fields are stable.
6. Implement Task 16 persistence, cache, resume, compatibility readers, and invalidation after all upstream ownership fields are stable.
7. Defer full cross-system regression assertions to Task 17.

## 9. Risks

- `story-localization.service.ts` and `short-rewrite.service.ts` are shared hot spots; avoid parallel edits outside Tasks 13/14 boundaries.
- Issue codes can be duplicated between validation, routing, cost, and cache if ownership is not enforced.
- Fingerprints and cache keys can drift if Task 15 and Task 16 are implemented independently.
- Media manifests have multiple active shapes; Task 14 should add dependency records without replacing manifests before Task 16.

## 10. Acceptance Criteria

- Execution order is fixed as `11 -> 12 -> 13 and 14 -> 15 -> 16`.
- Shared ownership boundaries are clear and non-overlapping.
- Overlapping files and merge risks are documented.
- Every new type, schema, issue code, fingerprint, manifest field, cache key, and invalidation rule has exactly one owning task.
- Integration checkpoints after Tasks 10, 12, 14, and 16 are defined.
- Tasks 13 and 14 can be implemented in parallel with stated constraints.
- Assertions deferred to Task 17 are explicitly listed.

## 11. Post-Task-10 Verification Checklist

- Confirm final Task 08 localized full lineage and locale validation fields.
- Confirm final Task 09 short contract, parent hash, StoryIR hash, contract hash, and source extraction fields.
- Confirm final Task 10 short prompt compiler, generation routes, schema fingerprints, model config, artifact paths, and status fields.
- Confirm no duplicate abstractions are needed for variant, locale, lineage, parent hashes, short contracts, prompt compilation, or validation.

## Ownership Matrix

- New validation issue-code type/schema: Task 11.
- Required short validation issue-code equivalents: Task 11.
- Routing purpose and repair scope type/schema: Task 12, unless Tasks 08-10 already added them.
- Routing/retry/incomplete issue codes: Task 12.
- Metadata/audio artifact-owner dependency fields: Task 13.
- Scene/image/render/publish artifact-owner dependency fields: Task 14.
- Request fingerprint fields and duplicate expensive retry suppression: Task 15.
- Cost event and telemetry summary schemas: Task 15.
- Manifest fields for persistence, lineage, compatibility, and status: Task 16.
- Cache keys and resume eligibility rules: Task 16.
- Invalidation matrix and invalidation issue codes: Task 16.

## Integration Checkpoints

- After Task 10: verify final short/full lineage, contract, prompt, schema, manifest, issue-code, and artifact path surfaces.
- After Task 12: verify full and short routes cannot cross, incomplete responses are persisted, and duplicate failed fingerprints are blocked.
- After Task 14: verify narration, metadata, audio, scene, image, render, thumbnail, upload metadata, and publication boundaries are independent.
- After Task 16: verify resume and invalidation are variant-safe across full, localized full, canonical short, localized short, and downstream media artifacts.

## Parallelism

- Tasks 13 and 14 can be implemented in parallel after Task 12.
- Task 13 must avoid media manifest/cache edits owned by Tasks 14 and 16.
- Task 14 must consume metadata/audio ownership from Task 13 through artifact dependencies, not by editing narration prompts.
- Both tasks must coordinate artifact-owner names before merging.

## Assertions Deferred To Task 17

- End-to-end regression matrix across all supported languages and variants.
- Full multi-locale integration runs.
- Complete media pipeline regression from narration through upload.
- Migration documentation validation.
- Exhaustive compatibility audit for legacy artifacts and commands.
