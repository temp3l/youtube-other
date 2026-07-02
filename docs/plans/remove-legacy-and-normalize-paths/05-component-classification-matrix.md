# Component Classification Matrix

| File or directory | Package | Component | Responsibility | Inbound | Outbound | Runtime entry points | Classification | Evidence | Future action | Risk | Validation |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `apps/cli/src/index.ts` | `@mediaforge/cli` | root CLI | mixed legacy and active commands | operator | all packages | `mediaforge` | SHARED | registers legacy `run` and active `audio/images/render` | SPLIT | High | CLI registration tests |
| `apps/cli/src/story-*.ts` | `@mediaforge/cli` | story commands | rewrite/localize/analyze/pipeline | operator | story-localization | `stories` | DARK_TRUTH_ONLY | direct active story services | KEEP_AS_IS then resolver refactor | Medium | focused unit tests |
| `apps/cli/src/episode-commands.ts` | `@mediaforge/cli` | episode commands | Dark Truth episode orchestration | operator | dark-truth | `episode` | SHARED | active but via duplicate orchestrator | MOVE_TO_DARK_TRUTH use cases | High | episode command tests |
| `apps/api/src/index.ts` | `@mediaforge/api` | API boot | health wrapper | HTTP | pipeline | API server | LEGACY_ONLY | only imports `createPipeline()` | REPLACE | Medium | API startup test |
| `apps/web/src/index.ts` | `@mediaforge/web` | static page | simple HTML | web | shared only | none found | UNRELATED | no pipeline coupling | KEEP | Low | typecheck |
| `packages/pipeline/src/index.ts` | `@mediaforge/pipeline` | pipeline orchestrator | older end-to-end workflow | CLI/API/tests | many packages | create/run | LEGACY_ONLY | legacy stage enum, createPipeline | DELETE_AFTER_MIGRATION | High | import absence tests |
| `packages/dark-truth/src/index.ts` | `@mediaforge/dark-truth` | episode orchestration | source parse, narration, images, render | episode commands | media packages | `episode` | SHARED | active but duplicate | SPLIT/MOVE_TO_DARK_TRUTH | High | characterization tests |
| `packages/story-localization/src` | `@mediaforge/story-localization` | story workflow | full/short localization | CLI | OpenAI/cache/fs | `stories` | DARK_TRUTH_ONLY | active docs/tests | KEEP_AS_IS then resolver refactor | Medium | unit/integration |
| `packages/speech/src/narration-*` | `@mediaforge/speech` | staged narration | TTS, cache, quality | CLI/dark-truth adapter | OpenAI/fs | `audio narration` | DARK_TRUTH_ONLY | active docs/tests | KEEP_AS_IS | Medium | speech tests |
| `packages/image-generation/src/episode-image-pipeline.ts` | image-generation | image pipeline | scene images/manifests | CLI | OpenAI/fs | `images` | DARK_TRUTH_ONLY | canonical media docs | KEEP_AS_IS | Medium | image tests |
| `packages/image-generation/src/openai-image.ts` | image-generation | raw helper | direct image API | CLI `generate-openai` | OpenAI | utility | SHARED | bypasses richer manifest | INVESTIGATE/SIMPLIFY | Medium | stale command search |
| `packages/rendering/src/index.ts` | rendering | renderer | local/remote ffmpeg | CLI/pipeline/dark-truth | ffmpeg/ssh | render | DARK_TRUTH_ONLY | active render commands | KEEP_AS_IS | Low | render unit tests |
| `packages/metadata/src` | metadata | metadata generation | YouTube metadata | CLI/upload | OpenAI/fs | metadata | DARK_TRUTH_ONLY | active cache tests | KEEP_AS_IS | Low | metadata tests |
| `packages/youtube-upload/src` | youtube-upload | publisher | YouTube upload | CLI | googleapis | upload | DARK_TRUTH_ONLY | active CLI | KEEP_AS_IS | Low | unit tests |
| `packages/shared/src/episode-filesystem.ts` | shared | path resolver | workspace paths | all | fs/path | library | SHARED | already contains canonical and legacy paths | SIMPLIFY/EXTEND | High | resolver tests |
| `packages/persistence/src/index.ts` | persistence | SQLite store | manifests/runs/steps | pipeline/API | SQLite | db migrate | SHARED | mainly legacy pipeline uses it | INVESTIGATE | Medium | db tests |
| `packages/domain/src/index.ts` | domain | schemas | shared contracts | all | zod | library | SHARED | active media schemas | SIMPLIFY | Medium | unit tests |
| `docs/architecture/*` | docs | architecture docs | current/target docs | humans | n/a | n/a | SHARED | mixed legacy/current statements | UPDATE | Low | stale search |
| `episodes/*/script.md` | workspace | root script | compatibility full script | old readers | fs | data | ACTIVE_NONCANONICAL | present in many episodes | MIGRATE/REMOVE | High | migration dry run |
| `episodes/*/<lang>/<variant>/script.md` | workspace | generated scripts | generated/compat | old readers | fs | data | ACTIVE_NONCANONICAL | present across episodes | MIGRATE/CLASSIFY | High | hash comparison |
| `episodes/*/languages/script-*.md` | workspace | authored scripts | multilingual sources | desired resolver | fs | data | DARK_TRUTH_ONLY | 001 and 022 present | KEEP_CANONICAL | Medium | resolver tests |

Items not listed explicitly must be classified during implementation by import graph and stale-reference searches before deletion.
