# Post-refactor mathematics implementation audit

Audit date: 2026-07-14  
Audited branch: `mathe-init`  
Audited `HEAD`: `7d8c03ff18891058889c594741e56e516f552fee`  
Previous audit revision: `69f26d3` plus its recorded dirty worktree  
Source task: `todo-prompts/math-2/01-post-refactor-math-audit.md`

## 1. Verdict

**FAIL — not ready for canonical private production.**

The refactor fixed packaged CLI startup, introduced the shared workflow engine,
upgraded the verifier to protocol v3, added profile and visual-policy contracts,
and retained strong legacy math artifact, localization, rendering, quality,
metadata, and dry-run controls. Fresh focused checks passed: 1 registry test, 4
packaged CLI tests, and 17 verifier-boundary tests.

The production migration is nevertheless declarative, not executable. The real
packaged `workflow lesson graph` reports `implementationBound: false` for all 18
registered math tasks. `createOperator` passes an empty implementation map, and
the production-caller adapter records a task identity before invoking the
original legacy callback. Consequently, legacy `math production run|resume`
still calls `runPilotSimulation`; it does not execute through `WorkflowOperator`.

The tracked curriculum is still a 206-skill draft with 206 incomplete provenance
mappings, 19 prerequisite edges, zero state overrides, and only three
`approved-simulation` lesson capabilities. The checked-in teacher is still a
simulation placeholder and correctly blocks public publishing. An existing v3
virtual environment works, but clean offline bootstrap is currently broken
because `setup-offline.sh` still requires verifier version `2.0.0` while source
and the adapter require `3.0.0`.

Finding count: **1 Critical, 4 High, 3 Medium**. No behavior was independently
accepted in this audit; this was an adversarial self-audit with fresh focused
evidence.

## 2. Baseline and change scope

### Repository baseline

| Item                                       | Current evidence                                                                        |
| ------------------------------------------ | --------------------------------------------------------------------------------------- |
| Branch                                     | `mathe-init`                                                                            |
| `HEAD`                                     | `7d8c03ff18891058889c594741e56e516f552fee` (`during refactor`)                          |
| Upstream                                   | `origin/mathe-init` is at `2197009156ed909d8a4e61757ef7554bcab49770`                    |
| Previous audit                             | `69f26d3`; the old audit also included its listed uncommitted R-009/renderer changes    |
| Recent history                             | `7d8c03f`, `2197009`, `b67dd63`, `b6fb38c`, `69f26d3`, followed by the R-007 history    |
| Production-code dirty state at audit start | None in the requested math/runtime package paths                                        |
| Pre-existing dirty documentation           | Modified AI-context/refactor docs; untracked Batch-14 and math-2 reports/task pack      |
| Pre-existing untracked non-doc data        | `.artifacts/`, `.tmp/mock-openai-server.mjs`, `README-mathe.md`, `math-video-examples/` |

The existing modified and untracked paths were inspected where required but
were not adopted, cleaned, overwritten, or treated as current acceptance
evidence. This audit changes documentation only.

### Math-relevant diff from `69f26d3` to `HEAD`

The targeted diff contains 228 changed paths, approximately 24,466 insertions
and 2,100 deletions. Material changes include:

- new shared contracts, artifact repository, registry, workflow store/operator,
  cache, batch, and attempt-observability code in `packages/workflow-engine`;
- a complete math DAG plus profile/fingerprint/store contracts in
  `packages/math-education`;
- verifier v3, expanded deterministic checks, educational speech, thumbnail,
  publishing lineage, and fail-closed quality changes;
- new `packages/educational-renderer` formula/chalk/security/package work;
- packaged CLI, workflow CLI, and production-caller mapping code;
- generic publishing approval/mutation seams in `packages/youtube-upload`;
- removal of tracked educational-renderer benchmark/generated media.

The diff also exposes the central migration gap: task definitions and shared
engine infrastructure were added, but math task implementations were not bound
to the canonical operator.

## 3. Evidence levels

| Label                    | Meaning                                                                                       |
| ------------------------ | --------------------------------------------------------------------------------------------- |
| `FOCUSED_TESTED`         | Executed successfully in this audit with the exact command recorded below.                    |
| `IMPLEMENTED`            | Current source implements the contract, but this audit did not execute its focused test.      |
| `INFERRED`               | Derived from composition of current source contracts; no end-to-end execution evidence.       |
| `HISTORICAL_ONLY`        | A report claims acceptance, but no fresh evidence in this audit accepts it.                   |
| `INDEPENDENTLY_ACCEPTED` | Separately accepted from current source/artifacts. No item received this label in this audit. |

## 4. Real runtime map

| Boundary                             | Owner and public entry point                                                                                                                                         | Input/output contract and current implementation                                                                                                                                                                  | Artifact identity, cache/state                                                                                                          | Evidence                                                                                                        |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| CLI composition                      | `apps/cli/src/index.ts`; `registerMathCommands`, `registerWorkflowCommands`, `migrateProductionCommandCallers`                                                       | Registers both legacy `math ...` and canonical `workflow lesson ...` commands. Package entry points resolve `dist` JavaScript.                                                                                    | CLI JSON/error envelopes; no state merely from help or curriculum validation.                                                           | `FOCUSED_TESTED`: packaged CLI 4/4, including root/story/math help and curriculum commands.                     |
| Legacy-to-task mapping               | `apps/cli/src/production-caller-migration.ts`; `ProductionTaskCallerAdapter.invoke`                                                                                  | Resolves command names to task definitions, then invokes the original Commander callback. It does **not** invoke the registered task implementation or `WorkflowOperator`.                                        | Async-local invocation identity only; legacy callback keeps its own state/artifacts.                                                    | `IMPLEMENTED`; direct source trace.                                                                             |
| Canonical operator                   | `packages/workflow-engine`; `WorkflowOperator`                                                                                                                       | Validated DAG, run/continue/retry/resume/invalidate/reconcile, strict attempts, locks, approvals, artifact validation, cache decisions.                                                                           | Canonical workflow events/state under the unit root; fingerprints bind task/workflow/identity/material/dependencies.                    | Generic fixture is `FOCUSED_TESTED`; math execution is not.                                                     |
| Math registry                        | `packages/math-education/src/task-registry.ts`; `createMathTaskRegistrations`, `mathWorkflowDefinition`                                                              | 18 tasks from curriculum import through irreversible publish, with declared owners/contracts/policies. The default implementation map is empty.                                                                   | Artifact contracts use kind, schema ID/version; registry revision `math.task-registry.v2`.                                              | Registry DAG 1/1 passed; packaged graph showed 18/18 `implementationBound: false`.                              |
| Canonical CLI construction           | `apps/cli/src/workflow-commands.ts`; `createOperator`                                                                                                                | Loads profiles/styles and fingerprints, but calls `createMathTaskRegistrations({}, evidence)`. Verification support is passed as unconditional `true`.                                                            | Shared `ArtifactRepository` verifies manifests; no handler can currently promote a math output.                                         | `IMPLEMENTED`; graph command result.                                                                            |
| Curriculum/objective/lesson          | `packages/math-education`; `loadCurriculumRelease`, `buildLessonVariant`                                                                                             | Structural release loading is real. Lesson generation is fixture-backed for exactly `M5-ZO-001`, `M5-GM-002`, and `M5-DZ-001`, all marked `approved-simulation`.                                                  | Legacy artifacts use `math-workflow.v2` lineage; canonical registry declares curriculum/lesson artifact contracts but has no writers.   | CLI validation passed; source shows draft release and three capabilities.                                       |
| Legacy production workflow           | `packages/math-education/src/orchestration/pilot-simulation.ts`; legacy `math production run                                                                         | resume`                                                                                                                                                                                                           | Executes the 15-stage simulated pipeline in an explicit workspace. It is not canonical shared-engine production.                        | `math-workflow.v2`, ordered parent fingerprints, schema/hash/byte identity, legacy resume/cache and quarantine. | `IMPLEMENTED`; direct CLI/source trace. Not executed in this audit. |
| Canonical artifacts/state            | `ArtifactRepository`, `WorkflowStore`, `CacheEngine`                                                                                                                 | Contained canonical/legacy resolution, durable promotion, manifest validation, attempts/events, invalidation and reconciliation.                                                                                  | Canonical artifact refs/manifests bind producer task/version/attempt, checksum, validator, and dependency fingerprints.                 | `IMPLEMENTED`; generic packaged operator fixture passed, math use is `INFERRED`.                                |
| Verifier                             | `SympyVerifierAdapter` and `python/math-verifier`                                                                                                                    | Protocol/spec v3, verifier `3.0.0`, SymPy `1.14.0`; fail-closed spawn/IO/timeout/output/version/identity/status handling.                                                                                         | Request input hash/check order; output version/request/hash/check identities. Verifier results are cache inputs downstream.             | `FOCUSED_TESTED`: 17/17 adapter integration tests. Offline bootstrap script is inconsistent with v3.            |
| Localization and mathematical speech | `fact-lock.ts`, `localization.ts`, `locale-formatter.ts`, `tts-lexicon.ts`                                                                                           | Five locales preserve locked facts. Display and spoken forms are separated; integers/decimals use deterministic digit words, and unsupported symbols/functions fail.                                              | Semantic/fact hashes and locale producer versions; speech v2 invalidates older punctuation-dependent cache identities.                  | `IMPLEMENTED`; current focused locale test exists but was not run.                                              |
| Provider speech                      | `packages/speech` educational pipeline; legacy `math speech generate`                                                                                                | Real and mock providers, request fingerprints, audio validation/assembly/mastering, resume/cache. Canonical `math.tts` has no implementation binding; the legacy command can call a configured provider directly. | Text, pronunciation, voice/model/endpoint/speed/profile/candidate inputs feed speech identity; legacy workflow records provider counts. | `IMPLEMENTED`, not run. No provider call occurred in this audit.                                                |
| Visuals                              | `packages/math-rendering`; `createProviderFreeMediaSlice`, component/cache/thumbnail APIs                                                                            | Fact-bound SVG components, teacher validation, mock TTS/media integration, measured thumbnail rules. This remains the legacy math semantic-rendering path.                                                        | Component/spec/fact/teacher/font/renderer hashes; legacy workflow parent fingerprints.                                                  | `IMPLEMENTED`; no fresh renderer integration in this audit.                                                     |
| Render transport                     | `packages/educational-renderer`; `createEducationalRenderer`                                                                                                         | Deterministic SVG/formula/chalk scene transport, cache/security, FFmpeg composition and output validation. Canonical `math.render` declares this owner but has no adapter.                                        | Cache key binds scene, profile, locale, font/toolchain, animation strategy and versions.                                                | `IMPLEMENTED`; current renderer tests were not run.                                                             |
| Quality                              | `quality-gate.ts`, `profile-quality.ts`; legacy quality/status CLI                                                                                                   | Non-overridable math failures and separate render, dry-run and publish gates. Canonical `math.quality-gate` is unbound.                                                                                           | Legacy `math-quality.v2` is workflow-owned and hash-bound; shared profile quality uses canonical artifact identity.                     | `IMPLEMENTED`; not freshly focused-tested.                                                                      |
| Metadata and thumbnail               | Math-specific implementation remains in `packages/math-education/src/metadata` and `packages/math-rendering/src/thumbnail`; registry declares `@mediaforge/metadata` | Strict metadata/catalog and fact/verifier/teacher-bound thumbnail exist on the legacy path. `packages/metadata` has no math-specific adapter.                                                                     | Locale/release/lesson/fact/source-lineage/font/teacher/output hashes. Placeholder art is explicitly non-publishable.                    | `IMPLEMENTED` legacy; canonical owner declaration is `INFERRED` only and unbound.                               |
| Publish dry-run                      | Legacy `math publish --dry-run`; generic approval/mutation APIs in `packages/youtube-upload`                                                                         | Legacy command validates exact workflow artifacts and emits zero-dispatch evidence. Canonical dry-run and live-publish tasks are both unbound.                                                                    | Metadata/thumbnail/media/quality/policy/channel/playlist hashes; `dispatchAllowed:false` on legacy path.                                | Static source; no publish command or mutation ran.                                                              |

## 5. Baseline hypotheses

| Hypothesis from `todo-prompts/math-2/README.md`                        | Result                                                        | Current evidence                                                                             |
| ---------------------------------------------------------------------- | ------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Refactor/shared engine accepted                                        | Confirmed as repository state, not math production acceptance | `docs/refactor/audit/README.md`; current shared-engine source.                               |
| Full math DAG exists but implementations are missing                   | Confirmed, stronger than phrased                              | All 18 graph nodes report `implementationBound:false`.                                       |
| Legacy `math production run                                            | resume` is simulation-backed                                  | Confirmed                                                                                    | `apps/cli/src/math-commands.ts` calls `simulate`/`runPilotSimulation`. |
| Curriculum remains draft                                               | Confirmed                                                     | CLI: `readyForProduction:false`, 206 incomplete mappings, 19 edges.                          |
| Class 5 has 37 skills; only three fixtures are simulation-approved     | Confirmed                                                     | Current `skills.json`, `capabilities.ts`, and fixture keys.                                  |
| Verifier v3/profile contracts exist and fail closed                    | Partly confirmed                                              | Adapter 17/17 passed; profile contracts are static-only here; offline setup script is stale. |
| Provider speech/sample render exist without full production acceptance | Confirmed as implementation/history, not current acceptance   | Speech source and sample report; no current provider/render run.                             |
| Teacher is a simulation placeholder and public blocker                 | Confirmed                                                     | `alex.v1-placeholder`; thumbnail/artifact and CLI publish checks.                            |

## 6. Historical disposition

The status applies to the historical finding/task, not to the whole product.
Current source/tests/commands are the acceptance evidence; report claims alone
are not.

| ID    | Status                      | Current evidence and rationale                                                                                                                                                                                           |
| ----- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| F-101 | `FIXED_BY_REFACTOR`         | `packages/math-education/package.json` exports `dist/index.js`; packaged CLI/root/story/math test passed.                                                                                                                |
| F-102 | `REGRESSED`                 | Existing `.venv` and adapter tests pass v3, but `setup-offline.sh:109` requires obsolete `2.0.0`, so clean reproducible provisioning fails its own check.                                                                |
| F-103 | `STILL_OPEN`                | Current curriculum CLI reports draft, 206 incomplete provenance mappings and 19 edges; `capabilities.ts` exposes only three simulation skills.                                                                           |
| F-104 | `SUPERSEDED`                | Current thumbnail contract separates simulation placeholder from approved artwork and current locale tests exist; public placeholder blocking remains intentional. Canonical media integration is now the operative gap. |
| F-105 | `FIXED_BY_REFACTOR`         | Math verifier/workflow/batch use `@mediaforge/observability`; shared attempts and batches redact structured metadata. End-to-end math telemetry remains unverified because handlers are unbound.                         |
| F-106 | `STILL_OPEN`                | Verifier v3 added systems, more geometry and four-field probability, but current Class-5 lesson/domain specifications remain absent outside three fixtures.                                                              |
| F-107 | `FIXED_BY_REFACTOR`         | `spokenInteger` and v2 lexicon use deterministic digit words rather than grouped display punctuation; unsupported speech fails visibly.                                                                                  |
| F-108 | `UNVERIFIED`                | Three selected files pass now, but the complete current release matrix, renderer, Python suite, and pilot were not rerun.                                                                                                |
| F-109 | `SUPERSEDED`                | The cited pre-refactor line failures are not the current release baseline; targeted broad lint/format was intentionally not rerun for this docs audit.                                                                   |
| A-001 | `FIXED_BY_REFACTOR`         | Same current packaged CLI evidence as F-101.                                                                                                                                                                             |
| A-002 | `REGRESSED`                 | Same v3 bootstrap version mismatch as F-102, despite a working pre-existing environment.                                                                                                                                 |
| A-003 | `HUMAN_OR_EXTERNAL_BLOCKER` | Tracked release remains draft; no current exact approval/provenance for the 37-skill Class-5 scope exists.                                                                                                               |
| A-004 | `FIXED_BY_REFACTOR`         | `mathThumbnailArtifactSchema` and renderer distinguish private simulation from publish-ready artwork; placeholder cannot be promoted by boolean.                                                                         |
| A-005 | `STILL_OPEN`                | Deterministic checker breadth improved, but reviewed lesson/domain coverage for the intended Class-5 rollout is missing.                                                                                                 |
| A-006 | `FIXED_BY_REFACTOR`         | Shared attempt/batch observability plus math correlation events now exist; canonical full-path evidence remains pending M2-002.                                                                                          |
| A-007 | `FIXED_BY_REFACTOR`         | Deterministic locale speech v2 and five-locale unit coverage exist.                                                                                                                                                      |
| A-008 | `UNVERIFIED`                | Current three-command budget passed, but it does not independently establish the full matrix.                                                                                                                            |
| A-009 | `SUPERSEDED`                | The single-skill legacy pilot is replaced by canonical three-skill private acceptance in M2-009; no current canonical pilot is accepted.                                                                                 |
| R-001 | `UNVERIFIED`                | Current `checks.py` is v3 and materially broader, but this audit ran adapter boundary tests, not all domain-check tests.                                                                                                 |
| R-002 | `REGRESSED`                 | Process boundary passes 17 tests; clean offline setup rejects current verifier `3.0.0` as not `2.0.0`.                                                                                                                   |
| R-003 | `STILL_OPEN`                | Prior “accepted” status did not create a production release; current tracked data remains explicitly incomplete and draft.                                                                                               |
| R-004 | `SUPERSEDED`                | Shared `ArtifactRepository`, `WorkflowStore`, operator and cache replace legacy authority; `math-workflow.v2` imports only as reconciliation evidence. Math production adapters are still absent.                        |
| R-005 | `FIXED_BY_REFACTOR`         | Three differentiated, capability-filtered simulation fixtures remain current and unsupported skills fail closed. This does not satisfy the new 37-skill target.                                                          |
| R-006 | `FIXED_BY_REFACTOR`         | Current locked-fact localization and speech v2 preserve five-locale semantic identity.                                                                                                                                   |
| R-007 | `SUPERSEDED`                | Legacy provider-free rendering remains, while the refactor assigns canonical render transport to `educational-renderer`; the required adapter does not exist.                                                            |
| R-008 | `FIXED_BY_REFACTOR`         | Legacy quality/status remains fail-closed and shared profile quality separates render/dry-run/publish gates.                                                                                                             |
| R-009 | `SUPERSEDED`                | Strict legacy metadata/thumbnail/dry-run code exists, but canonical metadata/dry-run registrations are unbound and ownership moved across packages.                                                                      |
| R-010 | `FIXED_BY_REFACTOR`         | Shared attempt/batch redaction and math correlation events now exist. Full canonical task telemetry is blocked by M2-002.                                                                                                |
| R-011 | `UNVERIFIED`                | Fresh registry/CLI/verifier checks pass; the complete repository/math/horror release matrix was not authorized.                                                                                                          |
| R-012 | `SUPERSEDED`                | M2-009 defines the current three-domain private pilot; no current canonical pilot artifacts were accepted.                                                                                                               |

## 7. Current requirement matrix

| Requirement                                     | Current status                                   | Evidence level                                    | Gap / owner                                                                                         |
| ----------------------------------------------- | ------------------------------------------------ | ------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Packaged root, story/horror and math startup    | Implemented                                      | `FOCUSED_TESTED`                                  | Startup only; no broad story production run.                                                        |
| Complete math DAG and declared ownership        | Implemented                                      | `FOCUSED_TESTED`                                  | Definitions are not implementations.                                                                |
| Executable canonical math handlers              | Not implemented                                  | command result                                    | 18/18 unbound; M2-002.                                                                              |
| Legacy production commands delegate to operator | Not implemented                                  | source trace                                      | Mapping wrapper invokes original simulation callback; M2-002.                                       |
| Canonical artifacts/state/cache                 | Implemented generically                          | generic fixture `FOCUSED_TESTED`; math `INFERRED` | Requires real math adapters and adversarial artifacts; M2-002.                                      |
| Side-effect-free canonical plan                 | Implemented generically                          | `IMPLEMENTED`                                     | Math plan can inspect definitions but cannot prove task dry-run handlers because none exist.        |
| Structural curriculum validation                | Implemented                                      | CLI command                                       | 206 skills parse; not production-ready.                                                             |
| Reviewed Class-5 curriculum/provenance/DAG      | Blocked                                          | current data                                      | Human/external evidence required; M2-003.                                                           |
| 37 Class-5 standard lesson specifications       | Not implemented                                  | current capabilities                              | Three simulation fixtures only; M2-004–M2-007.                                                      |
| Exact AST and fact/check lineage                | Implemented for existing fixtures                | `IMPLEMENTED`                                     | Must scale to every reviewed specification.                                                         |
| Verifier v3 process boundary                    | Implemented                                      | `FOCUSED_TESTED`                                  | 17/17 passed.                                                                                       |
| Reproducible offline verifier bootstrap         | Defective                                        | static current source                             | Stale `2.0.0` check; M2-002 prerequisite.                                                           |
| Required deterministic domain coverage          | Partial                                          | `IMPLEMENTED`                                     | Current checker breadth exceeds v2, but Class-5 content-specific coverage is incomplete/unverified. |
| Five-locale fact-lock/localization              | Implemented for current fixtures                 | `IMPLEMENTED`                                     | No fresh locale test; 37-skill coverage absent.                                                     |
| Deterministic mathematical speech text          | Implemented                                      | `IMPLEMENTED`                                     | Digit-wise realization is deterministic; pedagogical/naturalness review remains external.           |
| Canonical TTS task and provider authorization   | Not implemented                                  | graph/source                                      | Legacy direct command exists; `math.tts` unbound; M2-002/M2-008.                                    |
| Semantic visuals and thumbnail contracts        | Implemented on legacy path                       | `IMPLEMENTED`                                     | Canonical adapter and current renderer evidence absent; M2-002/M2-008.                              |
| Educational renderer integration                | Implemented package, not wired                   | `IMPLEMENTED`                                     | Current chalk/render integration not freshly run; M2-008.                                           |
| Quality gates                                   | Implemented on legacy/profile paths              | `IMPLEMENTED`                                     | Canonical `math.quality-gate` unbound.                                                              |
| Math metadata and playlist evidence             | Implemented in math-education legacy path        | `IMPLEMENTED`                                     | Registry declares metadata package, which has no math adapter; M2-002/M2-008.                       |
| Thumbnail teacher/public policy                 | Implemented fail-closed                          | `IMPLEMENTED`                                     | Checked-in art remains public-release blocker by design.                                            |
| Zero-mutation publish dry-run                   | Implemented on legacy path                       | `IMPLEMENTED`                                     | Canonical dry-run unbound; no command run in audit.                                                 |
| Live math publishing                            | Disabled in practice                             | source/graph                                      | Legacy command is dry-run only; canonical irreversible task is unbound and outside this task pack.  |
| Observability/redaction                         | Implemented at shared/legacy boundaries          | `IMPLEMENTED`                                     | No full canonical math attempt exists to accept end-to-end coverage.                                |
| Batch isolation/resume                          | Implemented generically and in legacy simulation | `IMPLEMENTED`                                     | Canonical math batch rejects unbound tasks.                                                         |
| Three-skill private pilot                       | Not accepted                                     | no current artifacts/command                      | M2-009 after prerequisites.                                                                         |
| 37-lesson private batch                         | Not started                                      | dependency state                                  | M2-010.                                                                                             |
| Independent acceptance                          | Not performed                                    | audit method                                      | M2-011.                                                                                             |

## 8. Commands and results

The test wrapper and all Vitest configs were inspected first. Exactly three
distinct focused test commands were run.

| Command                                                                               | Exit | Result                                                                                                |
| ------------------------------------------------------------------------------------- | ---: | ----------------------------------------------------------------------------------------------------- |
| Git branch/HEAD/status/history and targeted `69f26d3..HEAD` diff inventory            |    0 | Baseline recorded; pre-existing changes preserved.                                                    |
| `node apps/cli/bin/mediaforge.js math curriculum validate`                            |    0 | Structurally valid; `readyForProduction:false`; 206 incomplete mappings; 19 edges.                    |
| `node apps/cli/bin/mediaforge.js math production plan ...`                            |    0 | Hand-authored legacy simulation plan; zero reported writes/subprocesses/providers.                    |
| `node ... workflow lesson graph --lesson M5-ZO-001-standard ...`                      |    1 | Expected input rejection: canonical production unit IDs are lower-case. No write.                     |
| Same graph command with `m5-zo-001-standard`                                          |    0 | All 18 math nodes reported `implementationBound:false`.                                               |
| `pnpm test:focused -- packages/math-education/src/task-registry.unit.test.ts`         |    0 | 1/1 passed. Validates DAG/owner declarations, not handlers.                                           |
| `pnpm test:focused -- apps/cli/src/packaged-cli.e2e.test.ts`                          |    0 | 4/4 passed: package import, root/story/math help, curriculum dispatch, generic fixture operator loop. |
| `MATH_VERIFIER_PYTHON=... pnpm test:focused -- .../sympy-adapter.integration.test.ts` |    0 | 17/17 passed, including v3 success, failures, bounds, identity, timeout/process-group kill.           |
| Existing `.venv` version probe                                                        |    0 | SymPy `1.14.0`, pytest `8.4.1`. Static setup script check still expects verifier `2.0.0`.             |
| Targeted Prettier check for changed documentation                                     | 1, 0 | Three Markdown files were formatted; the unchanged targeted rerun passed.                             |

No build, typecheck, broad test, lint, snapshot, fixture regeneration, provider,
render, publish, or upload command was run.

## 9. Findings by severity

### Critical — M2-F001: canonical math production is definitions-only

- Evidence: `createMathTaskRegistrations()` defaults to `{}`;
  `workflow-commands.ts:createOperator` explicitly passes `{}`; packaged graph
  reports 18 unbound nodes.
- Bypass: `ProductionTaskCallerAdapter.invoke` calls the original callback;
  legacy `math production run|resume` calls `runPilotSimulation`.
- Impact: no registered task can produce a canonical math artifact, attempt, or
  cache hit, and “caller migration” does not move math execution authority.
- Remediation: M2-002. Bind real owner adapters, make legacy production commands
  thin operator adapters, and retain simulation only as an explicit fixture.

### High — M2-F002: reviewed production curriculum and lesson content do not exist

- Evidence: draft release, 206 incomplete mappings, 19 edges, zero overrides,
  37 Class-5 records but only three `approved-simulation` capabilities.
- Impact: truthful private production cannot select or generate the 37 lessons.
- Remediation: M2-003 is a human/external review gate; M2-004–M2-007 implement
  only the approved content slices.

### High — M2-F003: clean offline verifier setup rejects verifier v3

- Evidence: source/TS/worker use `3.0.0`, while
  `python/math-verifier/setup-offline.sh:109` requires `2.0.0`.
- Impact: the existing local venv passes, but a clean checkout cannot establish
  the documented reproducible verifier environment through that script.
- Remediation: M2-002 must align and test the bootstrap before canonical verifier
  execution is accepted.

### High — M2-F004: profile readiness is not anchored to repository release authority

- Evidence: profile schemas validate hash shape and caller-supplied status/
  approval fields but do not recompute `contentHash` or resolve the declared
  release hash from `loadCurriculumRelease`; `createOperator` sets
  `deterministicVerificationSupported:true` unconditionally.
- Impact: after handlers are added, a self-consistent caller-authored profile
  could claim reviewed curriculum or verifier support without authoritative
  release/capability evidence.
- Remediation: M2-002/M2-003 must resolve and compare canonical release,
  capability and verifier evidence rather than trust profile assertions.

### High — M2-F005: media/metadata/publish ownership is not integrated

- Evidence: registry declares `math.visual-assets`, `math.tts`, `math.render`,
  `math.metadata-playlists`, and `math.publish-dry-run` owners, but each is
  unbound. Math metadata still lives in `math-education`; `packages/metadata`
  has no math adapter.
- Impact: existing legacy code and new package capabilities cannot form the
  required canonical media path or cache lineage.
- Remediation: M2-002 establishes adapters; M2-008 completes and verifies the
  media path after reviewed representative lesson contracts exist.

### Medium — M2-F006: deterministic profile fixture overstates shared-engine evidence

- Evidence: `runMathProfileDeterministicFixture` labels traversal
  `stateSource:"shared-engine"`, but its comment says no implementation,
  renderer, TTS, or publish seam runs; it only topologically marks IDs complete.
- Impact: the fixture can be mistaken for executable shared-engine acceptance.
- Remediation: M2-002 must replace/add a real operator traversal and keep this
  fixture explicitly definition-only.

### Medium — M2-F007: legacy and canonical plans disagree

- Evidence: legacy `math production plan` emits 15 stages and `publish`; the
  canonical DAG has 18 tasks including `visual-style`, `publish-dry-run`,
  `publish-approval`, and irreversible `publish`.
- Impact: operators cannot infer canonical execution or safety boundaries from
  the legacy plan.
- Remediation: M2-002 makes the legacy plan a projection of `WorkflowOperator`.

### Medium — M2-F008: current release acceptance remains unverified

- Evidence: selected registry/CLI/verifier files passed, but renderer,
  localization, curriculum DAG, quality, metadata/thumbnail, Python domain,
  math operator, batch, and pilot evidence were not all run.
- Impact: implementation source is not equivalent to current independent
  acceptance.
- Remediation: follow focused evidence in M2-002–M2-010, then M2-011.

## 10. Provider and mutation safety

- This audit made zero provider, render, upload, publish, playlist, credential,
  or production-media mutations.
- Canonical `math.tts`, `math.publish-dry-run`, and `math.publish` cannot execute
  because their handlers are unbound. This is safe but non-functional.
- Legacy math generation requires explicit `--simulate`; the simulation manifest
  records `paidProviderCalled:false`.
- Legacy `math speech generate` is provider-capable when invoked without
  `--speech-dry-run` and with credentials. It currently bypasses canonical
  operator state, so M2-002/M2-008 must preserve explicit authorization and
  migrate its state/artifact boundary.
- Legacy `math publish` rejects absence of `--dry-run`, validates authoritative
  inputs, and does not instantiate the generic mutation seam.
- `packages/youtube-upload` contains a live generic mutation seam for other
  production families. The math-2 pack does not authorize binding or invoking
  it; M2-002 must keep math publishing dry-run-only.
- Placeholder teacher assets cannot become publish-ready by a caller boolean.

## 11. Story/horror compatibility

The packaged CLI test freshly passed root help, `stories production batch
--help`, and math help through the real entry point. This accepts packaged
startup compatibility only. Story/horror production execution, artifacts,
providers, rendering, and publishing were outside this audit and remain
unverified here.

## 12. Unverified areas

- Current Python domain test suite and clean offline setup from a wheelhouse.
- Current curriculum release/DAG unit tests beyond CLI structural validation.
- Profile-contract, localization, quality, batch, metadata, thumbnail, speech,
  math-rendering, and educational-renderer focused suites.
- Any real canonical math `run`, `resume`, invalidation or reconciliation.
- Provider authorization/cost/redaction through a real canonical math attempt.
- Current local FFmpeg/Remotion/chalk output and pixel-level teacher overlay.
- Actual private pilot artifacts, cache reuse, corruption recovery and media QA.
- Full story/horror behavior beyond packaged startup.
- Broad build/typecheck/lint/test/release gates.

## 13. Backlog and next action

The current dependency-ordered backlog is
`docs/mathe/audits/remediation-backlog-v2.md`. Start M2-002 and M2-003 from the
same audited revision. They may proceed independently: adapter work must remain
blocked on production content, while curriculum review must not depend on
adapter completion. Content implementation M2-004–M2-007 can proceed once the
M2-003 review contract/scope is stable, but canonical integration acceptance
requires M2-002.
