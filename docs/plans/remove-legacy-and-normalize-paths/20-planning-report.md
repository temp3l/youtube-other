# Planning Report

## Git context

- Starting branch: `master`
- Starting commit: `12eb29f5528f6dc597721ac71f2a0cb041c3a8db`
- Planning branch: `plan/remove-legacy-and-normalize-paths`
- Uncommitted changes: substantial pre-existing dirty worktree across CLI, story-localization, speech, metadata, docs, content, and untracked assets. These were not reverted.

## Analysis summary

Dark Truth scope is the active story, narration, image, render, metadata, and upload production surface driven by `apps/cli`. Legacy scope is the old `@mediaforge/pipeline` flow, root legacy CLI commands, `apps/api` pipeline boot, and duplicate Dark Truth orchestration that bypasses application boundaries. Shared scope is path/config/domain/persistence/media packages that active and legacy flows both touch.

Path problems center on competing script locations: `languages/script-*`, root `script.md`, `en/script.md`, and `<language>/<variant>/script.md`. Episode 022 proves English and German scripts currently exist in conflicting locations.

CLI problems are obsolete workspace assumptions and direct low-level calls to scene, image, audio, and render helpers.

## Recommended target state

Canonical authored full scripts live at `episodes/<slug>/languages/script-<language>.md`. Distinct authored Shorts live at `episodes/<slug>/languages/short/script-<language>.md`. A central resolver owns lookup, validation, containment, ambiguity detection, content hashing, and cache identity. All CLI/API/worker surfaces call typed application use cases before domain/infrastructure services. Legacy pipeline code and compatibility path layers are removed after migration.

## Implementation waves

1. Characterization tests.
2. Domain types and resolver.
3. Active consumer refactor.
4. Cache/artifact identity.
5. Migration tooling and episode migration.
6. Legacy entry-point removal.
7. Shared abstraction simplification.
8. Docs, dependency, and final stale cleanup.

Safe batches: type definitions with resolver tests; docs with stale searches; package dependency cleanup after import removal. Isolate migration writes, legacy deletion, and public CLI removal.

## Highest risks

- Divergent duplicate scripts: mitigate with hash inventory and manual resolution.
- Cache collisions: include language, variant, path, and content hash.
- Public command/package removal: release notes and temporary aliases only if approved.
- Production data cleanup: require separate operational procedure.

## Unresolved decisions

- Manual winner for divergent duplicate script files.
- Whether external consumers need deprecation windows for root CLI and `@mediaforge/pipeline`.
- Whether historical SQLite rows and generated legacy artifacts are archived or retained.

## Planning completion status

READY_WITH_BLOCKERS

Evidence identifies the active and legacy boundaries, path conflicts, target architecture, migration order, and validation strategy. Blockers are human decisions around duplicate script divergence, public contract deprecation, and production data cleanup.
