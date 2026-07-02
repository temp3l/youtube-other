# Final Cleanup Checklist

## Stale source references

- [ ] `@mediaforge/pipeline`
- [ ] `createPipeline`
- [ ] root `mediaforge run/create/status/inspect/retry`
- [ ] `story-workflow-legacy`
- [ ] `legacyGeneratedImage`
- [ ] `legacyMixed`
- [ ] `narrationPipelineMode` legacy values
- [ ] raw root `script.md` construction
- [ ] `en/full/script.md` as authored source
- [ ] `de/full/script.md` as authored source
- [ ] `full/script.md` hard-coding
- [ ] `audio/script-source`
- [ ] `original-transcript.json`
- [ ] direct `path.join(episodeDir, ..., "script.md")`

## Stale contracts

- [ ] old CLI commands
- [ ] old API imports/routes
- [ ] old queue/event names, if found
- [ ] old environment variables
- [ ] old package exports
- [ ] old manifest schemas
- [ ] old cache prefixes
- [ ] old storage prefixes

## Workspace cleanup

- [ ] root `script.md`
- [ ] `en/script.md`
- [ ] `<language>/<variant>/script.md` classified as generated or removed
- [ ] compatibility copies absent
- [ ] no generated scripts committed as authored sources
- [ ] 022 English canonical resolves
- [ ] 022 German canonical resolves
- [ ] full and Short variants isolated

## Tests and fixtures

- [ ] legacy-only tests removed
- [ ] shared behavior tests updated
- [ ] resolver tests cover traversal and ambiguity
- [ ] fixtures do not depend on compatibility paths
- [ ] no broad snapshots regenerated without approval

## Docs and operations

- [ ] docs describe `languages/script-<lang>.md`
- [ ] docs do not call root `script.md` canonical
- [ ] runbooks use supported CLI only
- [ ] `.env.example` has no stale legacy-only keys
- [ ] Docker/CI/deployment references checked, if present
- [ ] release notes list public contract removals

Every remaining match must be classified as `VALID_ACTIVE_REFERENCE`, `VALID_HISTORICAL_REFERENCE`, `FALSE_POSITIVE`, or `REQUIRES_REMOVAL`.
