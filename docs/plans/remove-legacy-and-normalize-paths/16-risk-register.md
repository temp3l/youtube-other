# Risk Register

| Risk | Evidence | Likelihood | Impact | Components | Mitigation | Validation | Rollback | Decision required |
|---|---|---|---|---|---|---|---|---|
| Duplicate scripts diverge | 022 has root, en script, en/full, languages | High | High | episodes, resolver | hash compare, manual resolution | migration dry run | restore moved paths from git | yes |
| Legacy CLI external users break | root commands are public | Medium | High | apps/cli | release note, replacement commands | CLI help tests | restore command delegation | yes |
| API breaks | API imports `createPipeline()` | Medium | Medium | apps/api | replace with config/app health | API startup test | re-add pipeline boot temporarily | no |
| Cache collision | current paths omit canonical identity | High | High | story/speech/metadata/render | include language/variant/hash | cache isolation tests | invalidate caches | no |
| Narration rollback loss | legacy mode is default today | High | High | config/speech/CLI | staged migration and release window | narration tests | set mode legacy until final removal | yes |
| Dark Truth behavior lost when removing `dark-truth` orchestration | episode commands depend on it | High | High | episode commands | characterization tests first | focused tests and dry runs | restore package/use case wrapper | no |
| Production data deleted accidentally | generated episode dirs large and mixed | Medium | High | episodes/state/locales/db | separate cleanup procedure | dry-run reports | restore from backups/git where tracked | yes |
| Docs become misleading | current docs call root script canonical | High | Medium | docs | stale-reference search | docs lint/search | revert docs only | no |
| External package consumers of `@mediaforge/pipeline` | package export public | Medium | Medium | package manifests | release note and major change | import absence tests | re-export shim for one release | yes |
| Unfound deployment wiring | no root `.github` found | Low | Medium | ops | final search before removal | file search | revert deployment edits | no |
