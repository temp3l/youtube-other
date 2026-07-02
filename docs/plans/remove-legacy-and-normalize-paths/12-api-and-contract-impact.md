# API And Contract Impact

| Contract | Owner | Consumers | Status | Change risk | Action | Validation |
|---|---|---|---|---|---|---|
| CLI `create/run/status/inspect/retry` | `apps/cli` | operators, scripts | legacy | High external uncertainty | remove after deprecation note or replacement | CLI help tests, stale searches |
| CLI `stories rewrite-full/localize/rewrite-short/analyze/pipeline` | `apps/cli` | operators | active | Medium | keep, resolver-backed | focused unit tests |
| CLI `episode analyze/plan/english/localized/short/review` | `apps/cli` | operators | active but duplicated | High | route to app use cases | characterization tests |
| CLI `audio generate/generate-localized` | `apps/cli` | operators | shared/legacy | High | stage through narration use case | audio tests |
| CLI `audio narration` | `apps/cli` | operators | active | Medium | keep, resolver-backed | speech tests |
| CLI `images/render/metadata/youtube` | `apps/cli` | operators | active | Medium | keep, resolver-backed where script-aware | command tests |
| HTTP API health wrapper | `apps/api` | possible external | legacy | Medium | replace `createPipeline()` with config/app health | API startup test |
| Package export `@mediaforge/pipeline` | package | API/CLI/tests/external unknown | legacy | High | remove after internal imports gone and release note | `rg @mediaforge/pipeline` |
| Story workflow manifests | story-localization | CLI/status | active | Medium | keep, add resolver identity | unit tests |
| Queue/events | none found | n/a | absent | Low | document absence | stale search |
| Environment `MEDIAFORGE_NARRATION_PIPELINE_MODE` | config/speech | CLI/operators | rollout | Medium | remove legacy values after migration | config tests |

Do not assume no external consumer because no repository consumer is found. Public CLI and package exports need release notes.
