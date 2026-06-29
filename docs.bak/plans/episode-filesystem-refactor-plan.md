# Episode Filesystem Refactor Plan

## Goal

Move the repository to a single, explicit episode filesystem contract without changing product behavior unnecessarily.

This plan is ordered by dependency so the refactor can be implemented safely:

1. establish the path contract,
2. move read/write ownership to that contract,
3. split the overloaded manifests,
4. migrate consumers,
5. preserve backward compatibility,
6. verify with migration and regression tests.

## Non-Goals

- No database redesign.
- No production-code changes in this task.
- No new pipeline features.
- No content migration run yet.
- No destructive rewrite of existing episode folders by default.

## Phase 1: Define the Contract

### Outcomes

- One path resolver API.
- One workspace validator API.
- One manifest ownership map.
- One schema version policy.

### Work items

1. Add branded types for:
   - `EpisodeId`
   - `LocaleCode`
   - `ContentVariant`
   - relative persisted paths
2. Define the canonical episode root and subroots:
   - `manifest.json`
   - `canonical/scenes.json`
   - `shared/`
   - `locales/<locale>/<variant>/`
   - `state/`
   - `deliverables/`
3. Define explicit ownership:
   - root manifest: identity, coarse stage status, path pointers
   - canonical scenes: semantic plan only
   - locale outputs: scripts, audio, captions, metadata, thumbnails
   - state manifests: retry, batch, render, upload, cost
4. Add a shared path resolver interface to a shared package, not inside pipeline logic.

### Dependencies

- None. This is the first step.

### Tests to add

- path normalization tests,
- workspace-boundary tests,
- locale normalization tests,
- variant normalization tests,
- relative-path persistence tests.

## Phase 2: Create Canonical Read/Write Helpers

### Outcomes

- Manifest loading and saving go through one helper.
- Atomic JSON writes are shared, not reimplemented.
- Discovery is deterministic and not inferred from display titles.

### Work items

1. Add a small manifest I/O layer:
   - runtime validation on load,
   - atomic write on save,
   - schema version check,
   - portable-path normalization.
2. Add deterministic episode discovery:
   - `episodeId` -> episode root,
   - no recursive fallback scan when an index exists,
   - no filename reconstruction in callers.
3. Add explicit compatibility readers:
   - root `scenes.json` fallback,
   - `output/scenes.json` fallback,
   - old localization layout fallback.

### Dependencies

- Phase 1.

### Tests to add

- manifest round-trip tests,
- compatibility read tests,
- duplicate-path collision tests.

## Phase 3: Split `scenes.json`

### Outcomes

- Canonical scene semantics are isolated.
- Execution state is no longer mixed into the canonical scene file.
- Image-generation state stops living in the scene plan.

### Work items

1. Freeze the canonical `scenes.json` contract:
   - stable IDs,
   - timing,
   - source segment references,
   - visual intent,
   - image prompt text only if it is part of the semantic scene.
2. Move mutable or execution-specific data out of the scene file:
   - `actualAudioDurationSeconds`,
   - image-generation status,
   - retry state,
   - render state,
   - per-run completion markers.
3. Introduce dedicated per-scene manifests where needed:
   - image generation manifest,
   - render manifest,
   - audio-segment manifest.

### Dependencies

- Phase 1 and Phase 2.

### Tests to add

- scene schema validation tests,
- scene stability tests,
- partial-regeneration tests,
- concurrent-writer tests for scene-related state.

## Phase 4: Rehome Locale Outputs

### Outcomes

- Locale and variant become first-class filesystem dimensions.
- English full and short no longer rely on special-case naming.
- Non-English variants no longer need path reconstruction in every caller.

### Work items

1. Move localized outputs under `locales/<locale>/<variant>/`.
2. Keep production instructions in English, but localize narration and locale-facing metadata.
3. Move locale-specific audio, transcript, captions, metadata, and thumbnail artifacts into the same locale/variant folder.
4. Keep shared cross-locale assets under `shared/`.
5. Add a compatibility layer for old paths during migration.

### Dependencies

- Phase 1 and Phase 2.

### Tests to add

- cross-locale isolation tests,
- full/short isolation tests,
- locale fallback tests,
- output discovery tests.

## Phase 5: Rehome Image Generation and Render State

### Outcomes

- `generated-assets/` becomes a compatibility-only layout or is replaced by a deliberate `state/image-generation/` model.
- Render clips and remote-render state are isolated from deliverables.

### Work items

1. Decide whether image generation keeps a compatibility alias for `generated-assets/`.
2. Move scene image manifests and prompt files into a dedicated image state directory.
3. Move render job manifests and clip manifests into a render state directory.
4. Add a variant-aware final-deliverable path for video output.
5. Require a profile-aware output root for youtube vs vertical renders.

### Dependencies

- Phase 1, Phase 2, and Phase 3.

### Tests to add

- render collision tests,
- remote-render rsync tests,
- clip manifest backfill tests,
- deliverable naming tests.

## Phase 6: Migrate Consumers

### Outcomes

- Every reader uses the new contract.
- Legacy paths remain readable, but not writable by default.
- Discovery becomes deterministic.

### Work items

1. Update pipeline orchestration to use the new resolver.
2. Update CLI commands to stop reconstructing paths manually.
3. Update metadata generation to consume the canonical scene file only.
4. Update upload logic to resolve metadata and final deliverables through the resolver.
5. Update story-localization to use the new locale/variant contract.
6. Update image generation to resolve shared assets and state directories through the resolver.
7. Update docs after code and tests agree.

### Dependencies

- Phases 1 through 5.

### Tests to add

- end-to-end workflow tests,
- backwards-compatibility tests,
- migration fixture tests,
- path-discovery tests.

## Phase 7: Add Migration Tooling

### Outcomes

- Existing episodes can be moved safely.
- Migration is dry-run capable and reversible enough to audit.

### Work items

1. Implement a migration command that:
   - detects old layouts,
   - maps old -> new paths,
   - reports collisions,
   - supports dry-run,
   - writes a migration report,
   - backs up or preserves the old tree by default.
2. Add per-episode and bulk migration modes.
3. Add a post-migration verification pass.
4. Persist migration status and allow safe reruns.

### Dependencies

- Phases 1 through 6.

### Tests to add

- migration dry-run tests,
- migration collision tests,
- rerun-idempotency tests,
- rollback-report tests.

## Phase 8: Tighten Observability and Cleanup

### Outcomes

- Logs describe the filesystem decisions explicitly.
- Cleanup stops depending on directory guesses.

### Work items

1. Standardize log fields:
   - `episodeId`
   - `locale`
   - `variant`
   - `stage`
   - `assetKind`
   - `inputPath`
   - `outputPath`
   - `manifestPath`
   - `jobId`
   - `operation`
   - `cacheStatus`
   - `executionTarget`
   - `schemaVersion`
2. Update cleanup to only remove files under explicit state directories.
3. Exclude temp files and incomplete rsync artifacts from discovery.

### Dependencies

- Phases 1 through 7.

### Tests to add

- cleanup safety tests,
- log-shape tests,
- temp-file exclusion tests.

## Recommended Implementation Order

1. Ship the shared path resolver and validators.
2. Wire the root manifest and canonical scene file through the resolver.
3. Move locale outputs to the new shape with compatibility readers.
4. Move image and render state out of mutable scene data.
5. Add migration tooling and fixture-based verification.
6. Remove compatibility fallbacks only after a full release cycle.

## Risk Controls

- Never delete or overwrite old episode layouts during the first migration pass.
- Keep old readers in place until the new layout is proven across representative episodes.
- Add fixture-based regression tests before changing the default output root.
- Treat `scenes.json` as a compatibility-sensitive file and migrate it last, after the new canonical location is stable.

## Acceptance Criteria

- One episode root per episode ID.
- One canonical scene file.
- One locale/variant output rule.
- One resolver used by all consumers.
- No absolute paths in persisted portable manifests.
- No render collisions between profiles.
- No cross-locale overwrite behavior.
- Backward-compatible reads for existing episodes.
- Migration command can dry-run and report collisions.
- Test coverage exists for path resolution, discovery, and migration.
