# Story Pipeline Deprecation Inventory

No production code should be deleted during the first workflow implementation. Deprecation candidates below require compatibility delegation, warning periods, and removal tests.

| Path / symbol | Current owner | Current responsibility | Callers | Classification | Future owner | Migration action | Compatibility plan | Removal prerequisite | Tests | Risk |
| ------------- | ------------- | ---------------------- | ------- | -------------- | ------------ | ---------------- | ------------------ | -------------------- | ----- | ---- |
| `apps/cli/src/story-localization-commands.ts` / `stories localize` | CLI | Older all-in-one story localization command | Operators, tests | KEEP_BUT_WRAP | `stories pipeline` workflow | Delegate to workflow stages after parity | Keep command and output shape; emit advisory only after parity | Unified workflow passes full existing localize tests and e2e | CLI unit + workflow integration | Medium |
| `apps/cli/src/story-full-rewrite-command.ts` / `stories rewrite-full` | CLI | Sync English full rewrite and optional localized full | Operators, tests | KEEP_BUT_WRAP | workflow `rewrite-full`/`localize-full` stages | Route through workflow adapter | Preserve flags, JSON payload fields, exit behavior | Existing command delegates without behavior regression | CLI unit + English fallback tests | Medium |
| `apps/cli/src/story-short-rewrite-command.ts` / `stories rewrite-short` | CLI | Short generation per language | Operators, tests | KEEP_BUT_WRAP | workflow `rewrite-short:<locale>` stages | Route through workflow stage after schema support | Preserve language flags and summaries | Short stage parity and status integration | CLI unit + short workflow tests | Medium |
| `apps/cli/src/story-analysis-command.ts` / `stories analyze/status/inspect` | CLI | Full-story quality analysis | Operators, tests | KEEP_BUT_WRAP | workflow quality stages | Delegate status to workflow when workflow manifest exists | Fall back to current full-only analysis for old artifacts | Short quality support and source fallback support land | analysis CLI + contract tests | Low |
| `apps/cli/src/episode-commands.ts` / language option help `en|de|es|fr` | CLI | Legacy episode production | Operators | MIGRATE | CLI/shared locale helper | Update help and parser to include `pt`; reject `sp` | No command removal | Portuguese parity tests | episode CLI tests | Low |
| `packages/story-localization/src/story-localization.service.ts` / localized mixed full+short mode | Story localization | Localized full and short in one provider response when `includeLocalizedShorts` | `stories localize` | DEPRECATE | Independent full/short workflow stages | Stop using mixed mode in unified workflow | Keep for legacy command until short parity proven | Independent localized short generation/gate has e2e coverage | story localization integration | High |
| `packages/story-localization/src/story-localization.schemas.ts` / `generatedStoryPackageSchema` for mixed full+short | Story localization | Legacy response schema combining full and short | localization service/batch | DEPRECATE | narration-only full schema + short schema | Prefer narration-only full and `short-rewrite` schemas | Maintain schema parser for legacy imports | No active command emits mixed payload by default | schema/unit/batch tests | Medium |
| `episodes/<episode>/script.md` compatibility root | Story localization | Legacy combined/root English script | many operators/commands | KEEP_BUT_WRAP | canonical `en/full/script.md` plus workflow artifact refs | Treat as compatibility output only | Continue writing/reading through resolver | All callers use canonical refs or resolver | path compatibility tests | Medium |
| `.localization-cache/entries/*` v2 cache entries | Story localization | Story cache keyed by source/config | full/short/batch | KEEP_BUT_WRAP | workflow cache metadata + existing cache | Keep as stage-local cache; workflow records cache decisions | Existing cache hits remain valid only with matching fingerprints | Workflow invalidation matrix implemented | cache/resume tests | Medium |
| `.batch/*` story batch manifests | Story localization | Provider-side text batch state | CLI batch | KEEP | provider batch executor | Link manifests from workflow `BatchSubmission` | Keep existing commands | None | batch integration | Low |
| `packages/image-generation/src/episode-image-pipeline.ts` duplicated media stage schemas | Image generation | Image stage dependency fields | image pipeline | MIGRATE | shared media-stage schema or workflow schema | Add adapter; avoid immediate shared refactor | Keep existing schema until all media packages agree | Cross-package schema contract tests | Medium |
| `packages/rendering/src/index.ts` duplicated media stage schemas | Rendering | Render dependency fields | rendering | MIGRATE | shared media-stage schema or workflow schema | Add adapter; avoid immediate shared refactor | Keep existing schema | Render dependency contract tests | Medium |
| `packages/youtube-upload/src/index.ts` duplicated media stage schemas | YouTube upload | Publication dependency fields | upload | MIGRATE | shared media-stage schema or workflow schema | Add adapter; avoid immediate shared refactor | Keep existing schema | Upload dependency tests | Medium |
| `packages/pipeline/src/index.ts` legacy `PipelineStage` | Pipeline | Older transcript-to-video pipeline | API/CLI | KEEP | separate legacy pipeline | Do not fold into story workflow yet | Leave untouched | None | existing pipeline tests | Low |
| `packages/dark-truth/src/index.ts` legacy orchestration | Dark truth | Older episode production orchestration | pipeline/CLI | KEEP_BUT_WRAP | workflow after parity | Characterize before delegation | Leave active until parity | End-to-end parity | High |
| Direct `curl` provider paths in metadata/speech | Metadata/speech | OpenAI-compatible file/metadata/TTS calls | metadata/speech | KEEP_BUT_WRAP | package owners + workflow observability | Do not batch initially; record stage telemetry | Preserve current behavior | Provider adapters mocked in workflow tests | Low |
| Legacy accepted localized compatibility markdown without lineage | Story localization | Human-readable artifact | analysis/source resolution | DEPRECATE AS FRESH CACHE | workflow/artifact manifests | Never treat as accepted fallback without current lineage | Allow read for display only | Fallback tests reject legacy-only artifacts | Medium |
| Any discovered `sp` artifact branch | Unknown/legacy | Accidental Spanish typo | none confirmed | UNKNOWN_REQUIRES_CONFIRMATION | locale migration task | Search episode/state/cache before migration; map `sp` to `es` or reject | Do not create new `sp`; quarantine conflicts | Migration test fixture with `sp` | Medium |

## Removal Phases

- Phase 1: add wrappers, schemas, status, and guards; no removals.
- Phase 2: legacy commands delegate to workflow while preserving flags.
- Phase 3: emit deprecation warnings for mixed localized full+short generation when explicitly requested.
- Phase 4: remove mixed generation only after e2e parity, migration tests, and no active artifact readers require it.

## Required Deprecation Tests

- Legacy command delegation preserves output.
- Mixed localized full+short is not used by `stories pipeline`.
- `sp` cannot create `sp/full`, `sp/short`, cache, batch, or workflow branches.
- Compatibility root `script.md` is readable but not a fresh fallback without canonical lineage.
