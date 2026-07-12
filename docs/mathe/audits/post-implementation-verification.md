# Post-implementation verification: mathematics genre

Date: 2026-07-12  
Audited commit: `ac21261` (`mathe-init`) plus the uncommitted mathematics worktree  
Source prompt: `docs/mathe/prompts/02-implement-math-genre.md`

Remediation update (2026-07-12): R-001 was independently accepted after source
review, adversarial domain tests, and a real TypeScript-to-Python integration
run. The explicit `math-verifier.v2` / `math-spec.v2` migration remains in
effect. R-002 is accepted with a hash-locked offline environment, guarded
process settlement, process-group timeout termination, bounded output, and
strict identity/version/stderr handling. F-001 and F-008 remain part of this
historical audit. R-003 is implemented as a hash-bound draft release: all 206
pending mappings are reported as explicitly incomplete, documented official
jurisdictions are registered, conservative reviewed prerequisite edges load,
and disconnected nodes are reported. R-003 was independently accepted after
source/data review, focused release and DAG tests, read-only CLI verification,
and package typechecks. The legacy NRW PDF URL currently redirects to the
agency homepage; the registry remains draft and should add the current NRW
curriculum landing page before editorial review.
R-004 is accepted with a v2 hash-bound workflow manifest, fail-stale v1
migration, transitive invalidation, symlink-aware workspace reads/writes,
visible quarantine, workflow/batch locks, persistent item checkpoints, bounded
classified retries, declared artifact-schema validation, and downstream-only
hash-valid resume. R-005 is implemented with strict reviewed fixture ports,
explicit variant semantics, near-duplicate/challenge gates, three approved
domain candidates, and capability-aware batch planning. Acceptance is pending.

## 1. Executive verdict

**Verdict: FAIL**

The repository contains a useful deterministic scaffold and one simulated lesson, but it is not safe for a paid pilot. Two Critical defects were reproduced: the verifier accepts mathematically invalid unit/probability checks, and resume reports a missing verification artifact as a valid cache hit. Ten High findings include an empty prerequisite graph, incomplete provenance, shallow localization locks, absent TTS/rendering, unsafe quality classification, one-skill-only scope, incomplete resilience/publishing, non-genuine variants, and a red horror compatibility gate.

Finding totals: **2 Critical, 10 High, 4 Medium, 2 Low**. The exact German pilot command exited 0 while returning `LOCALIZATION_ERROR`; the five-language simulation returned `READY_WITH_MINOR_EDITS` despite skipped TTS/render stages. Therefore the simulated pilot did not pass.

## 2. Scope and repository baseline

All 32 required requirement/plan Markdown files were decoded with a fatal UTF-8 decoder; none failed. The 3,946-line embedded curriculum seed was independently parsed and compared with normalized data.

Initial `git status --short --branch` showed branch `mathe-init`; modified `apps/cli/package.json`, `apps/cli/src/index.ts`, `packages/config/src/index.ts`, and `pnpm-lock.yaml`; and untracked math CLI/config, `packages/math-education`, `packages/math-rendering`, `python/math-verifier`, teacher assets, plans, and reports. The latest commit was `ac21261 init`; the implementation itself is uncommitted, so there is no reviewable implementation commit diff. The actual scope is a single `M5-ZO-001` deterministic fixture plus contracts, not completion of plan tasks T01–T28.

During validation, unrelated concurrent modifications appeared in `packages/rendering/src/index.ts` and `packages/rendering/src/index.unit.test.ts`; they were not reverted or attributed to this implementation. No existing completion report was used as evidence.

## 3. Commands executed

| Command                                                                                                                                                              |  Exit |      Duration | Result                                                                                                 |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----: | ------------: | ------------------------------------------------------------------------------------------------------ |
| `pnpm format:check`                                                                                                                                                  |     1 |       211.29s | 527 files reported; mostly unchanged/pre-existing, plus touched CLI/config files.                      |
| `pnpm lint`                                                                                                                                                          |     1 |        38.11s | 4 errors, all in unchanged story/upload files.                                                         |
| `pnpm typecheck`                                                                                                                                                     |     0 |       314.24s | All 26 scripted workspace projects passed, including math packages and CLI.                            |
| `pnpm test:focused -- packages/math-education/src/orchestration/math-pipeline.unit.test.ts`                                                                          |     0 |        12.31s | 4/4 passed.                                                                                            |
| `pnpm test:unit`                                                                                                                                                     |     1 |       305.73s | 136 files passed, 16 failed; 1,029 tests passed, 55 failed, 5 todo. All math unit tests passed.        |
| `pnpm test:integration`                                                                                                                                              |     1 |        12.40s | 3 files passed, 5 failed; 11 tests passed, 21 failed. Math failed because default Python lacked SymPy. |
| `MATH_VERIFIER_PYTHON=/tmp/mediaforge-math-verifier-venv/bin/python pnpm test:focused -- packages/math-education/src/verification/sympy-adapter.integration.test.ts` |     0 |         3.14s | 1/1 passed with provisioned local venv.                                                                |
| `python3 -m pytest` in verifier                                                                                                                                      |     1 |         0.02s | Active Python lacked `pytest`.                                                                         |
| `/tmp/mediaforge-math-verifier-venv/bin/pytest -q`                                                                                                                   |     0 |         0.88s | 3/3 Python tests passed.                                                                               |
| `pnpm build`                                                                                                                                                         |     0 |       109.65s | All scripted workspace builds passed.                                                                  |
| `pnpm test:e2e`                                                                                                                                                      |     1 |         1.06s | No E2E files exist.                                                                                    |
| `pnpm test:cli-packaged`                                                                                                                                             |     0 |        17.25s | All packaged horror CLI help checks passed.                                                            |
| Exact German simulated lesson command                                                                                                                                |     0 |         3.42s | Returned `LOCALIZATION_ERROR`; see section 14.                                                         |
| Five-language `math production run ... --simulate`                                                                                                                   |     0 |         3.35s | Returned `READY_WITH_MINOR_EDITS`; TTS/render skipped.                                                 |
| Class-5 batch create/process                                                                                                                                         | 0 / 2 | 2.83s / 3.59s | 1 succeeded, 36 unsupported, correctly reported `partial`.                                             |

Additional deterministic probes checked UTF-8, seed counts/hash stability, strict-schema failures, DAG failures, verifier domains, process failure, timeout, missing-output resume, locale rejection, status, metadata, and dry-run publishing.

## 4. Test and build results

Strict TypeScript and build gates pass. The focused math tests pass, but their assertions cover the scaffold rather than the approved architecture. Python passes only when an externally prepared `/tmp` venv is selected; the repository does not provide a reproducible install/lock command for the active interpreter.

The full unit and integration suites are red. Failed horror/image/story files are unchanged from `HEAD`, so they are reliably pre-existing relative to the math diff, but they still prevent the required backward-compatibility claim. `packages/rendering/src/index.unit.test.ts` was concurrently changed after baseline and is treated as indeterminate rather than math-caused.

## 5. Requirement coverage matrix

Statuses use the exact audit vocabulary. Evidence references source lines and executed probes.

|   # | Requirement                       | Status                       | Evidence                                                                     | Missing behavior / risk / remediation                                                                                 |
| --: | --------------------------------- | ---------------------------- | ---------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
|   1 | Curriculum source registry        | `IMPLEMENTED_BUT_INCOMPLETE` | `data/curriculum/v1/source-registry.json:1-63`; schema `curriculum.ts:25-62` | Only KMK, two SH records, and unverified Saarland 9/10 are present; add all documented sources and reviewed mappings. |
|   2 | Curriculum schema versioning      | `IMPLEMENTED_BUT_INCOMPLETE` | `curriculum.ts:84-100`; `release.json:1-9`                                   | Seed is strict v1, but release has no validated schema, input hashes, immutability, or migrations.                    |
|   3 | Markdown seed import              | `IMPLEMENTED_AND_VERIFIED`   | `importer.ts:17-32`; independent probe                                       | Exactly one JSON fence parsed; 206 normalized records and matching release hash verified.                             |
|   4 | Stable curriculum IDs             | `IMPLEMENTED_AND_VERIFIED`   | `identity.ts:12-19`; probe found 206/206 unique and stable hash              | No published-ID history/migration enforcement; add before release.                                                    |
|   5 | Grades 5–10                       | `IMPLEMENTED_AND_VERIFIED`   | `importer.ts:8-15,62-69`                                                     | Counts independently verified as 37/34/36/36/33/30.                                                                   |
|   6 | Three variants                    | `IMPLEMENTED_BUT_INCOMPLETE` | `variant-builder.ts:10-32,46-188`                                            | Only pilot skill supported; variants mostly change labels/numbers. See F-010.                                         |
|   7 | Prerequisite graph                | `NOT_IMPLEMENTED`            | `prerequisites.json:1-4`; importer `:58`; CLI `math-commands.ts:116,144`     | Zero edges and 206 disconnected skills; build/review real graph.                                                      |
|   8 | DAG cycle detection               | `IMPLEMENTED_BUT_INCOMPLETE` | `dag.ts:15-77`; injected cycle rejected                                      | Generic error gives no cycle path and production passes an empty graph.                                               |
|   9 | Dangling prerequisite detection   | `IMPLEMENTED_AND_VERIFIED`   | `dag.ts:24-32`; injected dangling edge rejected                              | Not exercised on any real graph.                                                                                      |
|  10 | State placement overrides         | `IMPLEMENTED_BUT_INCOMPLETE` | schema `curriculum.ts:125-138`; empty `state-overrides.json:1-4`             | No actual overrides or release integration.                                                                           |
|  11 | Exact mathematical values         | `IMPLEMENTED_AND_VERIFIED`   | `math-ast.ts:3-115`; domain tests                                            | Integer strings, rationals, scaled decimals, and separate measurements are exact.                                     |
|  12 | Expression/step AST               | `IMPLEMENTED_BUT_INCOMPLETE` | `math-ast.ts:6-82`; `lesson.ts:45-56`                                        | AST is typed; step IDs exist, but systems/domain-specific structures are inadequate.                                  |
|  13 | SymPy protocol                    | `IMPLEMENTED_BUT_INCOMPLETE` | TS `protocol-schemas.ts:4-28`; Python `worker.py:13-38`                      | Response version values are not pinned by adapter; domain semantics are shallow.                                      |
|  14 | TS-to-Python boundary             | `IMPLEMENTED_BUT_INCOMPLETE` | `sympy-adapter.ts:36-107`                                                    | Timeout exists, but early exit causes uncaught `EPIPE`; stderr/version/output-tree handling incomplete.               |
|  15 | Arithmetic verification           | `IMPLEMENTED_AND_VERIFIED`   | verifier probe and `test_worker.py:13-16`                                    | Exact integer arithmetic passed.                                                                                      |
|  16 | Algebraic equivalence             | `IMPLEMENTED_AND_VERIFIED`   | `checks.py:34-36`; valid/invalid probe                                       | Simple symbolic equivalence passed/rejected; domains/assumptions remain limited.                                      |
|  17 | Fractions and signs               | `IMPLEMENTED_AND_VERIFIED`   | `ast.py:16-19`; negative-fraction probe                                      | Exact `-1/2 + 1/3 = -1/6` passed.                                                                                     |
|  18 | Equations and systems             | `IMPLEMENTED_BUT_INCOMPLETE` | `checks.py:37-43`; probe                                                     | One-variable linear solve passes; a two-equation system returns `error`.                                              |
|  19 | Units and measurements            | `CONTRADICTS_REQUIREMENTS`   | `checks.py:44-49`; wrong-conversion probe                                    | `100 cm = 2 m` was reported `passed`; values/scales are ignored. Critical.                                            |
|  20 | Geometry verification             | `IMPLEMENTED_BUT_INCOMPLETE` | `checks.py:50-52`                                                            | Merely numeric equality; no formula/entity/domain validation.                                                         |
|  21 | Functions and graph values        | `IMPLEMENTED_BUT_INCOMPLETE` | same generic branch `checks.py:50-52`                                        | A `graph-point` check with no function or point contract passes.                                                      |
|  22 | Probability verification          | `CONTRADICTS_REQUIREMENTS`   | `checks.py:50-52`; probe                                                     | Probability total `3/2` passed when expected also said `3/2`; no range/normalization gate. Critical.                  |
|  23 | Unsupported-case handling         | `IMPLEMENTED_AND_VERIFIED`   | `checks.py:29-30,53-56`; adapter `:91-99`                                    | Unknown check/node becomes blocking `unsupported`; tested.                                                            |
|  24 | Hard blocking math failures       | `IMPLEMENTED_BUT_INCOMPLETE` | adapter `:91-99`; quality `quality-gate.ts:46-49`                            | Adapter blocks failed checks, but state/quality architecture is bypassable or misclassified.                          |
|  25 | Canonical German lesson           | `IMPLEMENTED_BUT_INCOMPLETE` | hard-coded phrases `localization.ts:28-39`                                   | Fixed pilot fixture only; no generation port/prompt registry.                                                         |
|  26 | Locked-fact localization          | `IMPLEMENTED_BUT_INCOMPLETE` | `localization.ts:86-142`                                                     | Lock omits step/example/challenge ordering and checks tokens only in two scenes.                                      |
|  27 | `de/en/es/fr/pt`                  | `IMPLEMENTED_AND_VERIFIED`   | `identity.ts:3-8`; five simulated locale artifacts                           | Fixed pilot narration exists for all five.                                                                            |
|  28 | Localized number formatting       | `IMPLEMENTED_BUT_INCOMPLETE` | `localization.ts:145-160`                                                    | Integer display only; tokens are never replaced; no decimals, rationals, units, or speech forms.                      |
|  29 | Glossary/TTS pronunciation        | `IMPLEMENTED_BUT_INCOMPLETE` | five JSON files; narration hardcodes version `localization.ts:137`           | Two terms per locale; files are never loaded or validated; no TTS adapter.                                            |
|  30 | Post-localization math validation | `NOT_IMPLEMENTED`            | `pilot-simulation.ts:127-148`                                                | Locales are written without re-verification or display-fact comparison.                                               |
|  31 | Formula-to-SVG boundary           | `IMPLEMENTED_BUT_INCOMPLETE` | `math-components.ts:48-61`                                                   | Produces KaTeX HTML inside SVG `foreignObject`, not deterministic formula SVG/cache.                                  |
|  32 | Typed visual components           | `IMPLEMENTED_BUT_INCOMPLETE` | `math-components.ts:64-110`                                                  | Many components are aliases; coordinates/values are ignored and no invalid-shape schemas exist.                       |
|  33 | Presentation profiles             | `IMPLEMENTED_AND_VERIFIED`   | `profiles.ts:1-36`; unit test                                                | Distinct size/object limits exist and reject invalid layouts.                                                         |
|  34 | Teacher asset contract            | `IMPLEMENTED_AND_VERIFIED`   | `teacher.ts:6-42`; manifest `:1-65`; unit test                               | Seven placeholder hashes validated; public artwork remains intentionally deferred.                                    |
|  35 | 180–300 seconds                   | `IMPLEMENTED_AND_VERIFIED`   | `timing.ts:5-20,35-74`                                                       | Pilot is 240 seconds, but based on planned weights rather than real audio.                                            |
|  36 | Narration-scene sync              | `IMPLEMENTED_BUT_INCOMPLETE` | `timing.ts:23-74`                                                            | Re-scales any durations to target; no TTS/audio/frame validation or drift gate.                                       |
|  37 | Idempotent stages                 | `IMPLEMENTED_BUT_INCOMPLETE` | `pilot-simulation.ts:88-104`                                                 | Resume can return cached; normal rerun rewrites, and cache validity is not checked.                                   |
|  38 | Atomic writes                     | `IMPLEMENTED_AND_VERIFIED`   | `artifact-store.ts:18-27`; pilot uses `writeJsonAtomic`                      | JSON writes are atomic; no binary/media writes exist.                                                                 |
|  39 | Resumable state                   | `CONTRADICTS_REQUIREMENTS`   | `pilot-simulation.ts:88-104`; missing-output probe                           | Missing verification file still returned `cached:true`. Critical.                                                     |
|  40 | Isolated batch failure            | `IMPLEMENTED_AND_VERIFIED`   | `batch.ts:17-58`; real batch                                                 | 1 success survived 36 independent failures; exit 2 `partial`.                                                         |
|  41 | Retry budgets                     | `IMPLEMENTED_BUT_INCOMPLETE` | `batch.ts:21-35`                                                             | Bounded count exists, but no retryability classification, persistent history, or provider/stage budget.               |
|  42 | Simulation mode                   | `IMPLEMENTED_AND_VERIFIED`   | CLI `math-commands.ts:48-68`; simulated runs                                 | Explicit workspace and local verifier used.                                                                           |
|  43 | Prevent paid calls in simulation  | `IMPLEMENTED_AND_VERIFIED`   | no provider imports; CLI guard `:48-57`; artifacts say false                 | Current math pipeline has no live provider implementation, so no paid dispatch path exists.                           |
|  44 | Debug request/response logs       | `NOT_IMPLEMENTED`            | no math debug logger/provider-call code                                      | Add versioned redacted logs at each boundary.                                                                         |
|  45 | Exclude Base64 from logs          | `IMPLEMENTED_BUT_UNVERIFIED` | no binary/provider logging exists                                            | No Base64 was observed, but there is no redaction/size test for future boundaries.                                    |
|  46 | Metrics/correlation IDs           | `NOT_IMPLEMENTED`            | math manifests `workflow.ts:43-58`; batch types `batch.ts:3-16`              | Required IDs, provider/model, duration, retry, token/cost, categories absent.                                         |
|  47 | Metadata generation               | `IMPLEMENTED_BUT_INCOMPLETE` | `math-metadata.ts:40-90`                                                     | Fixed pilot; non-German descriptions/playlists stay German; no DAG navigation.                                        |
|  48 | Playlist assignment               | `IMPLEMENTED_BUT_INCOMPLETE` | metadata `:73-89`                                                            | Three keys exist, but no catalog validation or YouTube assignment.                                                    |
|  49 | Thumbnail specification           | `IMPLEMENTED_BUT_INCOMPLETE` | metadata `:23-28,67-72`                                                      | Only text/promise/fact/profile; no composed asset/readability/cache contract.                                         |
|  50 | Dry-run publish manifest          | `IMPLEMENTED_BUT_INCOMPLETE` | `dry-run-manifest.ts:3-24`                                                   | Artifact is safe; CLI `--dry-run` conflicts and command cannot run.                                                   |
|  51 | Quality status machine            | `CONTRADICTS_REQUIREMENTS`   | `quality-gate.ts:27-57`; pilot `:149-181`                                    | Empty checks yield `READY`; render absence becomes minor edits; approval is a boolean.                                |
|  52 | Horror compatibility              | `IMPLEMENTED_BUT_UNVERIFIED` | packaged CLI passed; full unit/integration failed                            | Math imports are one-way/additive, but regression gate is red.                                                        |
|  53 | Pilot vertical slice              | `IMPLEMENTED_BUT_INCOMPLETE` | simulated artifacts under `/tmp`; section 14                                 | No audio, render, formula assets, thumbnail, complete provenance, or passing quality.                                 |
|  54 | Test coverage                     | `IMPLEMENTED_BUT_INCOMPLETE` | 20 math tests plus 3 Python tests; no E2E                                    | Missing negative boundary/domain/resume/render/localization tests; current tests permit Critical defects.             |
|  55 | Docs/operational commands         | `IMPLEMENTED_BUT_INCOMPLETE` | CLI help exists; no user operations doc                                      | Command names exist but setup, Python env, quality semantics, and remediation commands are undocumented.              |

## 6. Curriculum integrity

The seed and all required Markdown are valid UTF-8. Independent parsing found schema v1, 206 unique IDs, grade counts 37/34/36/36/33/30, exact ordered variants, deterministic repeated import hash, and a normalized `skills.json` hash match. Strict probes rejected an unknown field at `skills[0]`, invalid enum at `skills[0].placementConfidence`, duplicate ID, multiple JSON fences, and malformed JSON with line/column.

Injected graph probes rejected dangling, self, duplicate, and cyclic edges. However, `prerequisites.json` is empty, every imported `prerequisiteIds` array is empty (`importer.ts:58`), and all production calls validate `[]`. The cycle error is only “contains a cycle,” not the required useful path. Source provenance is uniformly a pending KMK synthesis (`importer.ts:46-53`); state overrides are empty. Thus structural seed integrity passes, but release/provenance/graph integrity does not.

## 7. Mathematical verifier assessment

Exact integer, rational, scaled-decimal, AST-only parsing, simple arithmetic, signs/fractions, one-variable solve, equivalence, malformed input, division by zero, unsupported node, process timeout, and protocol mismatch were exercised. The adapter rejects ordinary failed/unsupported responses.

Supported fully: exact scalar arithmetic and simple symbolic equivalence used by the pilot. Partially supported: one-variable equations, units, geometry, graphs/functions, probability, assumptions, approximations. Unsupported: equation systems and genuine domain-specific geometry/function/probability validation.

The decisive probe showed `wrong-unit-conversion` (`100 cm` versus expected `2 m`) as `passed`, because `checks.py:44-49` compares dimensions only. `probability-over-one` (`3/2`) and a graph check without function/point data also passed because lines 50–52 reduce every remaining domain to equality against LLM-supplied expected output. This violates the independent-truth boundary.

The default integration environment lacks SymPy/pytest. With the local venv, tests pass. `/bin/false` caused an uncaught stdin `EPIPE` (`sympy-adapter.ts:105`), and a 10-second timeout took 17.83 seconds because the spawned process tree/pipes outlived the rejected promise.

## 8. Variant assessment

All variants share the same objective and 240-second duration. Metadata says high/moderate/low scaffolding, concrete/mixed/symbolic abstraction, and guided/independent/transfer reasoning. Number sizes increase from `30405` to `730405` to `90730405`.

Objective evidence contradicts genuine differentiation: every variant has the same scene functions, durations, explanations, visual choices, challenge prompt, and challenge structure. Within each, `challenge-solution` is the same exact number as `example-number` (`variant-builder.ts:53-103,139-174`). The challenge therefore repeats the worked example rather than adding transfer/reasoning depth. Duration is asserted from a target, not narrated content.

## 9. Localization assessment

Five locale artifacts were produced with an identical fact-lock hash and the same three fact IDs. This is a useful invariant. However, narration stores unresolved `[[fact:...]]` tokens; no display/speech replacement is produced. Integer formatting exists but is not used. Decimal, rational, unit, and spoken formatting do not exist. Glossary files contain two terms each but are never read.

The lock contains objective, scene functions, and fact semantic hashes only (`localization.ts:86-97`); it omits worked-step order, example/challenge structure, solutions, and variant constraints. Token enforcement applies only to scene indexes 3 and 7 (`:117-121`). No post-localization verifier runs. English/Spanish/French/Portuguese metadata descriptions and playlist names remain German, confirmed in the pilot.

## 10. Rendering assessment

Typed profile and teacher-placeholder contracts pass. Formula rendering is KaTeX HTML embedded in SVG, without a formula cache/hash. Most declared visual components alias `EquationSteps`, `CoordinatePlane`, or `NumberLine`; point expressions are ignored in coordinate placement (`math-components.ts:89-110`). The “composition” is a Zod data object, not a Remotion composition/render (`composition.ts:4-33`). No math render integration, audio generation, FFmpeg validation, thumbnail render, or output media exists. A diagram failure cannot be injected into orchestration because no diagram renderer is called.

## 11. Orchestration and resilience assessment

Atomic JSON writes and sequential batch continuation work. The real class-5 batch retained the one success and reported 36 failures. Retry count is bounded.

Stage records do not represent actual stage execution: most have empty output lists yet are marked succeeded; all output paths are attached to `quality-gate` (`pilot-simulation.ts:183-209`). `outputsAreValid` exists (`workflow.ts:82-97`) but resume never calls it. Removing `canonical/verification.json` followed by resume still returned `cached:true` and listed the missing path. Batch reports are written only after all items complete; a restart rereads the original planned manifest, not successful/failed item state. There is no dependency-only invalidation, locking, retry classification, per-stage failure history, or interruption-safe item checkpoint.

## 12. Observability and security assessment

Math state lacks correlation ID, batch ID on lesson manifests, skill/variant/language per stage, provider/model, attempt, duration, cost/token data, and actionable categories. The root CLI emits an execution ID, but it is not linked into math artifacts. There are no math debug request/response logs. No keys, tokens, authorization headers, environment dumps, Base64, or raw binary were observed; provider/binary paths simply do not exist yet. Errors retain stacks, including absolute paths, but not structured math context.

## 13. Horror-pipeline regression assessment

Dependency scans found no story/dark-truth package importing math and no math source importing horror/story modules. `pnpm test:cli-packaged` passed, as did math-unrelated upload unit tests within the full run. However, the repository gate did not pass: 55 unit and 20 non-math integration failures occurred in unchanged story, image, metadata, rendering, and CLI files. They are pre-existing relative to the math worktree, not confirmed math regressions, but backward compatibility cannot be certified. Under the audit rule this remains High severity.

## 14. Simulated pilot results

Safest exact equivalent executed:

```bash
node apps/cli/bin/mediaforge.js math lesson generate \
  --skill M5-ZO-001 --variant standard --language de --simulate \
  --workspace /tmp/math-audit-pilot-de \
  --python /tmp/mediaforge-math-verifier-venv/bin/python
```

It exited 0 but returned `LOCALIZATION_ERROR`, because quality incorrectly requires all five locales even for a single-language selection. A five-language production simulation exited 0 as `READY_WITH_MINOR_EDITS` and produced curriculum/lesson/verification, five narrations/timings/visual placeholders/metadata/dry manifests, quality, and workflow state. It did not produce canonical narration as a distinct artifact, formula/diagram assets, TTS/audio, thumbnail, render, or media validation. TTS/render stages were `skipped`; publish was blocked. `paidProviderCalled:false` is credible because no live provider code is reachable.

`math quality check`, metadata, and status returned data. The publish dry-run command could not execute: the root/subcommand `--dry-run` option conflict made Commander report the required option missing even when supplied. The simulated pilot **failed** acceptance.

## 15. Findings by severity

### Critical

#### F-001 — Domain verifiers can approve mathematically false content

- Requirement: independent units, graph/function, geometry, and probability validation.
- References: `python/math-verifier/src/math_verifier/checks.py:44-52`; `test_worker.py:24-34`.
- Evidence: deterministic probe marked `100 cm = 2 m`, probability `3/2`, and a graph check without a point/function contract `passed`.
- Impact: mathematically incorrect narration or visuals can receive a successful verifier response.
- Fix: implement domain-specific schemas/checkers; compare unit scale and value; validate probability bounds/totals; require function and point; never trust expected output alone.
- Fix test: isolated checks for wrong unit magnitude, probability outside `[0,1]`, wrong graph point, formula misuse, and LLM-matching false expected values must return `failed`/`unsupported`.

#### F-002 — Resume accepts missing verification artifacts as valid cache hits

- Requirement: hash-valid resumable state; partial files must not be complete.
- References: `pilot-simulation.ts:82-104`; unused validator `workflow.ts:82-97`.
- Evidence: after moving `canonical/verification.json`, `production resume` returned `cached:true`, status `READY_WITH_MINOR_EDITS`, exit 0, and listed the missing file.
- Impact: corrupt/incomplete state can bypass mathematical re-verification and downstream invalidation.
- Fix: bind each stage to output hashes/schema/lineage; call `outputsAreValid`; invalidate transitive dependents on any missing/mismatched output.
- Fix test: delete/truncate each stage output, resume, and assert no cache hit, exact-stage rerun, dependent invalidation, and publish block.

### High

#### F-003 — Curriculum-wide production is actually one hard-coded skill

- Requirement: grades 5–10 and reliable pilot/batch architecture.
- References: `variant-builder.ts:46-51`; class-5 batch behavior.
- Evidence: real grade-5 batch produced 1 success and 36 `Unsupported lesson specification` failures.
- Impact: broader class-5 or curriculum production is impossible; planned scope was not completed.
- Fix: implement approved spec/generation port with fail-closed per-domain fixtures and explicit rollout flags.
- Fix test: at minimum the approved number/geometry/data private candidates pass; unsupported curriculum nodes are excluded at batch planning, not failed at runtime.

#### F-004 — Empty graph and incomplete provenance are reported as valid

- Requirement: reviewed prerequisite DAG, source mappings, state overrides, provenance gate.
- References: `prerequisites.json:1-4`; `state-overrides.json:1-4`; `importer.ts:46-58`; `math-commands.ts:103-123,142-145`; `pilot-simulation.ts:74-79`.
- Evidence: all 206 nodes are disconnected and pending-mapped to KMK, yet CLI/pilot say seed/DAG/source validation succeeded.
- Impact: ordering, playlist navigation, claims, and curriculum gates are unreliable.
- Fix: populate reviewed edges/mappings/overrides, load those files, call `validateProvenance`, and block pending claims/releases.
- Fix test: real release graph has reviewed edges, zero dangling/cycles, intentional disconnected report, stable order, and complete source coverage.

#### F-005 — Localization locks do not protect displayed/spoken mathematics

- Requirement: locked facts, controlled glossary/TTS, locale formatting, post-localization verification.
- References: `localization.ts:86-160`; `pilot-simulation.ts:127-148`; glossary files.
- Evidence: unresolved fact tokens, unused glossaries/formatter, partial token checks, no display/speech artifacts, no re-verifier.
- Impact: localized values, steps, solutions, or pronunciation can drift without detection once generation/TTS is added.
- Fix: versioned lock manifest covering all structures; deterministic display/speech resolver; glossary loader; post-localization display-fact verification.
- Fix test: mutate every locked dimension and omit a glossary term; each locale must visibly fail.

#### F-006 — Missing audio/render/media is downgraded to minor edits

- Requirement: TTS, synchronization, Remotion/FFmpeg validation, visual failure cannot be ready.
- References: `pilot-simulation.ts:175-200`; `quality-gate.ts:27-43`; rendering `composition.ts:4-33`.
- Evidence: TTS/render were skipped but quality became `READY_WITH_MINOR_EDITS`; “visual-assets” and timing-reflow were marked succeeded without outputs.
- Impact: incomplete media can appear near-ready and operational checks can misread stage success.
- Fix: implement stages or classify as `RENDER_BLOCKED`/`PUBLISH_BLOCKED`; require validated media before any ready status.
- Fix test: missing diagram, teacher asset, audio, MP4, or FFmpeg report must never yield READY/minor.

#### F-007 — Quality and CLI status gates are unsafe

- Requirement: derived fail-closed status machine and correct exit codes.
- References: `quality-gate.ts:27-57`; `pilot-simulation.ts:149-181`; CLI `math-commands.ts:171-180`.
- Evidence: empty checks yield `READY`; minor approval is a boolean; render assertion blocks only math error; exact German command exited 0 with `LOCALIZATION_ERROR`.
- Impact: automation can treat a blocked item as success; future callers can bypass review/gates.
- Fix: require complete named checks, signed/versioned approval, block render on every upstream blocker, map quality errors to documented exits.
- Fix test: empty/duplicate/missing checks and every status/approval/CLI combination.

#### F-008 — Verifier process boundary is not operationally fail-safe

- Requirement: controlled process failures, timeout, version validation, reproducible Python boundary.
- References: `sympy-adapter.ts:41-105`; `protocol-schemas.ts:20-28`; `pyproject.toml:1-10`.
- Evidence: default integration cannot import SymPy; `/bin/false` triggers unhandled stdin `EPIPE`; timeout took 17.83s; systems error; adapter accepts arbitrary verifier/SymPy version strings and nonempty stderr on success.
- Impact: worker failure can crash orchestration and leave partially written state; deployment is not reproducible.
- Fix: lock/install environment, handle stdin/error/close once, kill process group, validate versions/stderr/output size, add systems or explicit unsupported contract.
- Fix test: crash-before-stdin, malformed/noisy output, timeout with child process, version mismatch, output limit, and missing dependency.

#### F-009 — Publishing, thumbnail, and localized metadata vertical slice is incomplete

- Requirement: metadata, thumbnail, playlists, safe dry-run publishing.
- References: `math-metadata.ts:40-90`; `dry-run-manifest.ts:3-24`; CLI `math-commands.ts:371-428`.
- Evidence: non-German descriptions/playlists remain German; no DAG neighbors/catalog/thumbnail asset; no generic upload integration; supplied `--dry-run` is rejected as missing.
- Impact: pilot deliverables and publish preflight cannot be completed or reviewed.
- Fix: localize all fields, build deterministic thumbnail/catalog, repair option ownership, add fake publish core and channel-policy gates.
- Fix test: five-locale metadata semantics, thumbnail constraints, three playlist types, CLI dry run, zero fake-client mutations.

#### F-010 — Pilot variants are number substitutions with identical pacing/challenge

- Requirement: meaningful scaffolding, pacing, complexity, and transfer differences.
- References: `variant-builder.ts:53-103,116-174`; `lesson-validator.ts:3-33`.
- Evidence: same scene timings, steps, challenge prompt, visuals, and challenge-as-example value; validator checks only distinct enum labels.
- Impact: product variants do not deliver promised differentiation and challenge depth.
- Fix: independent beat/example/challenge specs and semantic similarity gate beyond metadata labels.
- Fix test: objective/fact invariants plus measured differences in segment pacing, prompts, scaffolds, representations, and transfer solution.

#### F-011 — Batch resume and retry state are not interruption-safe

- Requirement: persistent per-item resume, retry classification, successful-item preservation.
- References: `batch.ts:17-58`; CLI `math-commands.ts:292-340`.
- Evidence: item state exists only in the final report; processing rereads the original planned manifest; retries every caught error and has no dependency/blocking model.
- Impact: interruption loses progress bookkeeping and reruns failures/provider work in a future live pipeline.
- Fix: atomic item checkpoints, attempt history, retryable categories, dependency DAG, idempotent provider request IDs.
- Fix test: interrupt after one item, resume, and assert zero duplicate calls and retained successes.

#### F-012 — Required horror compatibility gate is red

- Requirement: no horror regressions.
- References: failed tests including `episode-commands.unit.test.ts:790,1126,1371`, `story-localization.integration.test.ts:249`, `index.integration.test.ts:70`, and `youtube-metadata.ts:1208`.
- Evidence: full unit 55 failures; integration 20 non-math failures. Files are unchanged from `HEAD`, so failures are pre-existing, not confirmed math-caused. Packaged CLI help passed.
- Impact: backward compatibility cannot be independently certified.
- Fix: establish a green baseline or reviewed quarantine before accepting math changes; do not weaken assertions.
- Fix test: H01–H04 and repository unit/integration gates green at the same commit.

### Medium

#### F-013 — Required observability/debug context is absent

- Requirement: correlation IDs, metrics, costs, retries, categorized redacted debug logs.
- References: `workflow.ts:35-58`; `batch.ts:3-16`.
- Evidence: fields and logger calls are absent; root execution ID is not persisted into math artifacts.
- Impact: failures/costs cannot be traced across lesson, locale, verifier, rendering, or batch.
- Fix: typed context envelope and redacted bounded debug/metric sinks.
- Fix test: complete context on success/failure/retry; secrets/Base64/binary fixtures redacted or rejected.

#### F-014 — CLI input and artifact reads bypass runtime schemas/containment

- Requirement: strict types, safe paths, useful failures.
- References: `math-commands.ts:126-140,243-249,262-287,310-314,363-426`.
- Evidence: arbitrary locale `it` reaches a TypeError; batch manifest uses asserted JSON; status/metadata/publish resolve user paths without `MathWorkspacePathResolver`.
- Impact: confusing crashes, malformed state acceptance, and unintended local-file reads.
- Fix: Commander parsers plus Zod schemas and contained resolver for every command.
- Fix test: invalid grade/variant/locale, malformed JSON, traversal, symlink escape, and wrong artifact version.

#### F-015 — Visual component contracts are nominal rather than semantic

- Requirement: typed/rejecting number-line, graph, geometry, table, probability-tree contracts.
- References: `math-components.ts:64-110`.
- Evidence: aliases collapse distinct components; graph x/y are not used; no domain schemas/cache hashes; formula is HTML in `foreignObject`.
- Impact: visually wrong diagrams can satisfy type-level presence checks.
- Fix: separate Zod contracts/renderers tied to verified facts and deterministic semantic SVG tests.
- Fix test: invalid/incomplete inputs reject and coordinates/formulas correspond to AST values.

#### F-016 — Test matrix is far ahead of implemented tests

- Requirement: test coverage and deterministic pilot E2E.
- References: `math-genre-test-matrix.md`; current 9 TS test files and one Python file.
- Evidence: no E2E files; missing domain-negative, localization-lock, workflow-corruption, render, observability, publishing, and compatibility characterization tests.
- Impact: Critical defects passed the implementation’s own tests.
- Fix: implement matrix release gates with semantic assertions and provisioned Python environment.
- Fix test: `pnpm test:e2e` must discover the pilot and failure-isolation tests.

### Low

#### F-017 — Graph diagnostics are not editorially useful

- Requirement: useful cycle path, duplicate/disconnected reporting.
- References: `dag.ts:31-32,75-76`.
- Evidence: cycle output contains no nodes; same pair with different edge kinds is not considered duplicate; disconnected nodes are silent.
- Impact: graph repair is slower and editorial intent is hidden.
- Fix: DFS/SCC path reporting and explicit disconnected/parallel-edge policy.
- Fix test: exact cycle path and deterministic disconnected report.

#### F-018 — Formatting and operating documentation gates are not clean

- Requirement: formatting and operational commands.
- References: repository command results; touched `apps/cli/src/index.ts`, `packages/config/src/index.ts`; absent math operations guide.
- Evidence: Prettier reports 527 files; lint has 4 unrelated errors; no documented venv/setup/quality/pilot workflow.
- Impact: noisy CI and operator ambiguity.
- Fix: separately baseline formatting/lint, format touched files, document exact offline setup and commands.
- Fix test: targeted Prettier/ESLint plus command examples in packaged smoke.

## 16. Unsupported or incomplete capabilities

- All lessons except `M5-ZO-001`.
- Reviewed prerequisite edges, state overrides, full source registry/provenance, migrations.
- Equation systems and genuine unit/geometry/function/graph/probability semantics.
- Generated canonical German narration, glossary-enforced localization, decimal/rational/unit speech.
- TTS, actual timing reflow, formula SVG cache, semantic diagrams, Remotion render, FFmpeg QA, thumbnail asset.
- Persistent stage/item execution, dependency invalidation, safe resume, structured observability.
- Generic YouTube publish core, channel policy, playlist assignment, live publishing (correctly absent).

## 17. Required fixes before any paid pilot

Complete remediation tasks R-001 through R-010 in the companion backlog. At minimum: repair verifier false positives; make resume hash/schema-valid; make quality fail closed; implement real provenance/graph/localization locks; produce validated audio/video/thumbnail; make the pilot and horror gates green. No paid provider credential should be made reachable before those gates pass.

## 18. Recommended improvements after the pilot

Expand reviewed lesson fixtures by domain, add editorial graph tooling, add locale reviewers/TTS lexicon coverage, persist cost/cache metrics, and phase curriculum releases append-only. Keep math packages one-way and separate from horror defaults.

## 19. Exact next command after remediation

```bash
MATH_VERIFIER_PYTHON=.venv/math-verifier/bin/python \
pnpm test:focused -- packages/math-education/src/verification/sympy-adapter.integration.test.ts
```

Then run the repaired pilot E2E before any simulation with paid-capable adapters.

Commands not executable as intended: `/usr/bin/time` was absent (shell `time` used); `pnpm exec tsx` was absent (built JS/Node used); default Python lacked pytest/SymPy (local venv used); `math publish ... --dry-run` failed because of the CLI option conflict; cleanup of generated Python `__pycache__` was denied by the approval reviewer’s usage limit.
