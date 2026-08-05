# History implementation note

## Canonical extension points

- `packages/domain/src/workflow-contracts.ts`: closed `history` content profile and shared workflow types.
- `apps/api` and `packages/api-sdk`: bounded History episode-content contracts and OpenAPI/SDK representation.
- `packages/persistence`: relational and Postgres project-profile compatibility for `history`.
- `packages/dynamic-genre`: runtime genre classification reusing the conservative historical base renderer.
- `packages/history`: strict config, presets, evidence, prompts, validation, media schemas, starter catalog, content-pack adapter, and canonical task registry.
- `packages/shared`: atomic writes, normalized episode IDs, and the existing `episodes/<id>` layout.
- `packages/workflow-engine`: History uses the shared DAG, state, events, attempts, cache, locks, and `next` calculation.
- `apps/cli`: composition only; provider-free inspect/validate/import and delegated workflow views.
- Existing localization, speech, image, rendering, metadata, API, and publishing abstractions remain downstream owners.

## Audit decisions

`historical` remains a dynamic-genre compatibility value; `history` is the production genre and `history-documentary` is import-only. The older episode status command is Dark Truth-specific, so History is exposed through `workflow history`. API project and episode contracts now represent History explicitly. No frontend genre chooser exists. The source pack remains immutable; imported artifacts use canonical episode roots.

## Migration and assumptions

The ten scripts are standard-format editorial drafts. Pack links are candidates, not verified evidence. Period parsing stores conservative taxonomy and confidence without invented exact dates. Reimport validates stored provenance, includes the README checksum in idempotency, retains existing manifest artifact history, and invalidates derived workflow tasks when input changes. All repository locales are supported, while actual generation still depends on configured providers. Existing Horror, Mathematics, Veronica Benini, strategic-reinvention, and dynamic profiles retain their IDs and defaults.

## Deferred improvements

Bind model-assisted History task implementations to the research provider orchestration, add map/timeline renderer adapters where capabilities exist, expose profile descriptions in a future frontend, and expand deterministic validators for anachronistic terminology and cross-claim numeric conflicts.
