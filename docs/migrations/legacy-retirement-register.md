# Legacy Retirement Register

Register version: 1

Recorded: 2026-08-01

Source plan: `docs/plans/legacy-retirement/README.md`

## Purpose and rules

This is the authority for deciding whether a compatibility surface may change
or be removed. A row covers a behavior family rather than every textual use of
the word `legacy`. Source and tests remain authoritative if this register
becomes stale.

Status meanings:

- `READY`: the next migration task can begin; deletion is not yet approved.
- `EVIDENCE_REQUIRED`: usage or data population is unknown and blocks removal.
- `RETAIN_FOR_MIGRATION`: the surface is required to migrate existing state.
- `DURABLE_CONTRACT`: the value remains part of persisted migration history
  even after it stops being selected for new work.

No support window begins until its evidence source exists. “One release window”
means one explicitly named production release interval, not elapsed local time.

## Retirement matrix

| ID | Surface and class | Current owner | Canonical replacement | Status | Follow-up |
| --- | --- | --- | --- | --- | --- |
| LR-001 | `narrationPipelineMode=legacy|shadow|new`; active rollback selector | Speech maintainer: `packages/speech`; config/CLI maintainers | Staged narration with `new` as default | EVIDENCE_REQUIRED | Task 02 |
| LR-002 | Monolithic `audio generate` branches; writable generation authority | Dark Truth production operator; `apps/cli`, `packages/dark-truth` | `runNarrationPipeline(..., all)` | EVIDENCE_REQUIRED | Task 02 |
| LR-003 | Locale and root `narration.wav` compatibility copies; write projection | Speech maintainer: `narration-paths.ts`, `dark-truth-adapter.ts` | Manifested mastered narration under the locale/variant staged root | EVIDENCE_REQUIRED | Tasks 02, 04 |
| LR-004 | Render/status narration fallback scans; read compatibility | Rendering and CLI maintainers | Resolver-selected staged artifact plus `READY` quality gate | EVIDENCE_REQUIRED | Task 04 |
| LR-005 | `ArtifactPathSet.legacy` candidates and repository migration; read/migration API | Shared/workflow maintainers | Canonical `ArtifactRef` path and manifest | RETAIN_FOR_MIGRATION | Tasks 03, 07 |
| LR-006 | Generated story `script.md` projections and legacy renderer package; write compatibility | Story-localization maintainer | Generated narration artifact plus canonical renderer input contract | EVIDENCE_REQUIRED | Tasks 03, 04 |
| LR-007 | Mixed/full-only story response and StoryIR normalization; import-only schema | Story-localization maintainer | Narration-only response and canonical story contract | RETAIN_FOR_MIGRATION | Tasks 03, 07 |
| LR-008 | Root `characters.json` and older image-state reads; read compatibility | Image-generation maintainer | `shared/characters.json` and canonical image manifests | EVIDENCE_REQUIRED | Tasks 03, 07 |
| LR-009 | Episode layout and legacy shot migration commands; migration tools | CLI and visual-planning maintainers | Canonical episode layout and shot plan | RETAIN_FOR_MIGRATION | Tasks 03, 07 |
| LR-010 | `uploadYoutubeEpisode`; irreversible writable publisher | Publishing operator; `apps/cli`, `packages/youtube-upload` | `publishYoutubeMedia` with bound approval, checkpoints, and reconciliation | READY | Task 05 |
| LR-011 | Public production commands wrapped as `legacy-cli` with filesystem authority; command aliases | CLI/application/workflow maintainers | Registered application task with one declared authority | EVIDENCE_REQUIRED | Task 06 |
| LR-012 | `runPilotSimulation` commands and manifest-owned math orchestration; writable workflow | Math production operator | Canonical math workflow operator and task registry | EVIDENCE_REQUIRED | Task 06 |
| LR-013 | Story/image/math legacy batch manifests with canonical sidecar writes; compatibility projection | Workflow plus domain batch maintainers | Canonical batch store/manifest as sole writer | EVIDENCE_REQUIRED | Tasks 03, 06 |
| LR-014 | `filesystem-legacy|database-v1` workflow authority markers | Workflow/persistence maintainer | `database-v1` for new and migrated workflow instances | DURABLE_CONTRACT | Tasks 06, 07 |
| LR-015 | `filesystem-legacy|object-storage-v1` asset authority and retained source | Persistence/asset migration maintainer | `object-storage-v1` after verified aggregate cutover | DURABLE_CONTRACT | Tasks 03, 07 |
| LR-016 | Thumbnail `--episode` alias | CLI maintainer | `--episode-slug` | EVIDENCE_REQUIRED | Tasks 06, 07 |
| LR-017 | Versioned legacy cache adapter API; no production constructor call found | Workflow-engine maintainer | Attempt fingerprint/cache records | READY | Task 07 |

## Evidence, windows, rollback, and removal gates

| ID | Data population and observation | Support-window end | Rollback | Removal gate |
| --- | --- | --- | --- | --- |
| LR-001 | Runtime population is unknown; staged selections now emit `narration.rollout-selection`, and the Task 02 matrix defines required quality evidence | One named release with `new` default and zero legacy rollback selections | Set mode to `legacy` during the open window | Accepted matrix, visible status, zero rollback use, operator sign-off |
| LR-002 | Active CLI branches are proven by direct calls; monolithic selections now emit a rollback event when mode is `legacy` | Same window as LR-001 | Restore mode routing to characterized monolith | LR-001 gate plus no direct monolithic caller |
| LR-003 | Existing episode population was not scanned; consumers are listed under LR-004 | One release after LR-004 has no compatibility reads | Re-enable manifested projection from mastered output | All registered consumers canonical and no new compatibility writes |
| LR-004 | Source consumers: rendering resolver, story render, workflow helpers, Dark Truth adapter | One release resolving canonical staged inputs only | Restore the named resolver adapter, never raw scanning | Full/Short dry-runs and operator scripts resolve manifested `READY` audio |
| LR-005 | 2026-08-01 dry-run: 127 canonical, 1 safe move, 14 identical, 42 divergent, and 0 errors across 184 candidates; dispositions remain open | After approved population has no unexplained legacy candidates | Preserve source plus migration manifest; select verified legacy read adapter | Clean dry-run, no active direct producer, retention disposition for exceptions |
| LR-006 | Active writes occur in full/localized story services; stored population unknown | One release after renderer contract and writes are canonical | Restore one explicit manifested projection | No compatibility write and no renderer consumer of legacy package |
| LR-007 | Stored batch/provider responses may use old schemas; population unknown | After supported import population is zero or formally archived | Restore versioned import parser only | No active producer; import census and operator retention decision |
| LR-008 | Source proves root fallback; episode population unknown | One release after migration census is clean | Restore read-only root registry adapter | Canonical registries exist or explicit exclusions are recorded |
| LR-009 | Tools are active CLI exports; legacy episode/shot population unknown | After LR-005/LR-008 populations are migrated or accepted | Restore migration command from tagged release | Clean migration reports and operator acceptance of retained data |
| LR-010 | CLI directly calls the legacy uploader; external operation history is not locally enumerable | One release with all CLI publishing through generic reports | Route CLI adapter back only before irreversible mutation starts | Mocked parity, approval/checkpoint evidence, no direct caller, operator sign-off |
| LR-011 | All mapped public production roots are wrapped; external script usage unknown | One release with deprecation diagnostics and zero compatibility invocations | Restore alias adapter while keeping the same canonical task | Packaged CLI parity, invocation evidence, and migrated external callers |
| LR-012 | `simulate` and legacy batch paths directly call `runPilotSimulation`; workspaces not inventoried | After existing simulations finish/migrate and one release has no new instance | Existing filesystem instances finish under their original authority | No new legacy instance, resume parity, disposition for every active manifest |
| LR-013 | Three active sidecar callers: story, image, and math batch storage | One release with canonical manifests as sole writers | Re-enable sidecar projection from canonical state | No legacy manifest writer/reader and migrated batch census |
| LR-014 | Persisted workflows may retain the enum; no production database census was run | Marker is not deleted while persisted rows or audit history reference it | Append audited authority transition; never rewrite history | New instances database-owned; zero active filesystem writers; schema retention decision |
| LR-015 | Persisted aggregates may retain source authority and rollback deadlines; no database census was run | Per-aggregate rollback deadline passed and source retention policy approved | Repository transition back only before deadline with source retained | All target aggregates cut over, hashes verified, no active filesystem writer |
| LR-016 | Alias is registered; invocation usage unknown | One release after deprecation warning is observable | Restore option normalization | Zero observed alias use and operator acceptance |
| LR-017 | Search found API and tests but no production `createVersionedLegacyCacheAdapter` caller | No window required after export-consumer check | Re-add versioned adapter without accepting unknown identity hits | Package export search clean and focused cache behavior retained |

## Source classification

The Task 01 search covered production TypeScript under `apps/` and `packages/`
and excluded unit-test-only matches. Matches are classified as follows:

- narration/config/render compatibility: LR-001 through LR-004;
- artifact, story, image, and migration compatibility: LR-005 through LR-009;
- publishing, CLI, math, batch, workflow, and asset authority: LR-010 through
  LR-016;
- dormant cache compatibility API: LR-017;
- schema fields, provenance labels, error names, and database history associated
  with those families remain governed by the same ID;
- uses of “incompatible” and narrative phrases such as “legacy inference” are
  domain semantics, not compatibility entry points;
- tests and fixtures inherit the classification of the production behavior they
  characterize; historical docs remain historical evidence.

## Decisions and blockers

- No code removal is approved by version 1 of this register.
- Tasks 02, 03, 05, and 06 may begin because their surfaces and gates are named.
- Production episode/lesson files, databases, external scripts, telemetry, and
  YouTube history were not inspected. Their unknown populations are explicit
  blockers on deletion.
- LR-014 and LR-015 are persisted migration vocabulary. Stopping selection of a
  legacy authority does not automatically authorize deleting the enum value or
  historical rows.
- Human acceptance roles are the Dark Truth production operator, math production
  operator, publishing operator, and workflow/persistence maintainer. Named
  individuals must be recorded in the implementation report when a gate is
  approved.
