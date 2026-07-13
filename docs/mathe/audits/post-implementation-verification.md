# Post-implementation verification: mathematics genre

Audit date: 2026-07-13

Audited revision: `69f26d3` plus the dirty worktree listed in section 2

Source prompt: `docs/mathe/prompts/02-implement-math-genre.md`

## 1. Executive verdict

**Verdict: FAIL**

The implementation has materially improved since the earlier audit: exact-value schemas, a fail-closed SymPy v2 protocol, locked localization, workflow lineage, provider-free media, quality gates, and most metadata/publish contracts exist. It cannot proceed to a real pilot. The packaged CLI imports TypeScript from `@mediaforge/math-education` and crashes before dispatch, which also breaks horror commands. The documented verifier virtual environment is absent, the current thumbnail locale suite is red, the checked-in teacher asset is intentionally rejected for publish readiness, curriculum review and lesson capability remain partial, and math observability is absent.

Finding count: **1 Critical, 4 High, 3 Medium, 1 Low**. Simulated pilot: **failed**. Horror regression: **failed**.

## 2. Scope and repository baseline

All requested files under `docs/mathe/{curriculum,sources,architecture,product,plans,prompts}` and `docs/mathe/README.md` were inspected. The 96 KB embedded seed was additionally parsed independently. Source and executable behavior, not prior reports, were treated as authority.

`HEAD` was `69f26d3`. The worktree already contained uncommitted R-009/publisher/educational-renderer changes, including `apps/cli/src/math-commands.ts`, `packages/math-education/src/{metadata,orchestration,publishing}`, `packages/math-rendering/src/thumbnail`, `packages/youtube-upload/src`, and `packages/config/src`. Those changes were audited in place. No production, test, configuration, curriculum, generated asset, or existing documentation file was edited by this audit.

Implementation scope observed: 206 normalized curriculum records; 19 reviewed prerequisite edges; zero state overrides; three approved simulated lesson skills (`M5-ZO-001`, `M5-GM-002`, `M5-DZ-001`); five locales; exact AST and SymPy v2 worker; workflow v2; provider-free renderer; metadata/thumbnail/dry-publish work in the dirty tree; no math telemetry integration.

## 3. Commands executed

| Command | Exit | Duration | Result |
|---|---:|---:|---|
| UTF-8 `iconv` check for every `docs/mathe/**/*.md` | 0 | 0.125 s | Passed |
| Independent Node parse/count/hash of embedded JSON seed | 0 | <1 s | 206 unique skills; grade counts 37/34/36/36/33/30; exact three variants |
| `pnpm mediaforge -- math curriculum validate` | 1 | 1.176 s | `ERR_UNKNOWN_FILE_EXTENSION` on `packages/math-education/src/index.ts` |
| `pnpm mediaforge -- math curriculum import --dry-run` | 1 | 1.218 s | Same startup failure; no write |
| `pnpm mediaforge -- math curriculum graph` | 1 | 1.188 s | Same startup failure |
| Focused Vitest unit command covering math, CLI, config, and upload | 1 | 5.759 s | 18 passed, 1 failed, remaining files not run due `--bail=1` |
| Focused Vitest integration command covering verifier/pilot/render | 1 | 5.953 s | 1 failed; 15 skipped/not run after bail |
| `python3 -m pytest -q python/math-verifier/tests` | 1 | 0.027 s | `No module named pytest` |
| `pnpm format:check` | 1 | 53.953 s | 626 files reported, including affected math files |
| `pnpm lint` | 1 | 7.910 s | 12 errors; 9 in math source, 1 upload source, 2 unrelated/adjacent |
| `pnpm typecheck` | 0 | 83.544 s | All 27 participating packages passed |
| `pnpm build` | 0 | 138.384 s | All 27 participating packages passed |
| Packaged math generate/quality/metadata/status/publish dry-run sequence | 1 each | 0.5–0.6 s each | All failed before dispatch; temp workspace remained empty |
| `node apps/cli/bin/mediaforge.js stories production batch --help` | 1 | 0.541 s | Horror CLI failed with the same math import error |
| Deterministic built-module variant/localization probe | 0 | <1 s | Three differentiated 240 s variants and five locked locales observed |

## 4. Test and build results

The directly affected unit test failure was `math thumbnail renderer > localizes every visible de label`: `Thumbnail text overflows its safe area` at `packages/math-rendering/src/thumbnail/math-thumbnail.ts:502`. The verifier integration failure was `SymPy adapter > verifies the pilot example and challenge through protocol v2`: `.venv/bin/python ENOENT`. Python tests could not start because `pytest` is not installed.

Strict TypeScript type checking and build passed. Formatting, lint, unit, integration, Python, packaged CLI, simulated pilot, and horror CLI gates did not pass. The three-test-command audit budget was exhausted; no unchanged failure was rerun. Root E2E and separate educational-renderer package tests were not executed.

## 5. Requirement coverage matrix

Status vocabulary is the one required by the audit prompt.

| # | Requirement | Status | Evidence | Gap / risk / remediation |
|---:|---|---|---|---|
| 1 | Curriculum source registry | IMPLEMENTED_BUT_INCOMPLETE | `data/curriculum/v1/source-registry.json`; `source-registry.ts:13-108` | Nine sources exist, but content hashes are null and all skill mappings are pending. Finish review in A-003. |
| 2 | Curriculum schema versioning | IMPLEMENTED_AND_VERIFIED | `curriculum.ts`; `release.ts:62-85`; independent parse | Strict v1 literals reject unknown fields/enums. |
| 3 | Markdown seed import | IMPLEMENTED_AND_VERIFIED | `importer.ts:9-72`; independent JSON-block parse | CLI wrapper is unusable; runtime packaging is A-001. |
| 4 | Stable curriculum IDs | IMPLEMENTED_AND_VERIFIED | `identity.ts`; `release.ts:87-154` | Migration/alias policy is strict. |
| 5 | Grades 5–10 | IMPLEMENTED_AND_VERIFIED | Independent counts: 37/34/36/36/33/30 | Curriculum coverage is present. |
| 6 | Three variants | IMPLEMENTED_AND_VERIFIED | Seed probe; `identity.ts:4`; variant probe | All seed records declare exactly three. |
| 7 | Prerequisite graph | IMPLEMENTED_BUT_INCOMPLETE | `prerequisites.json`; `dag.ts` | Only 19 edges; file truthfully says explicitly incomplete. |
| 8 | DAG cycle detection | IMPLEMENTED_BUT_UNVERIFIED | `dag.ts:40-73,121-142`; test exists | Focused unit run bailed before graph file; rerun after A-001/A-004. |
| 9 | Dangling prerequisite detection | IMPLEMENTED_BUT_UNVERIFIED | `dag.ts:85-100` | Static evidence only in this pass. |
| 10 | State placement overrides | DEFERRED_WITH_JUSTIFICATION | `state-overrides.json`; `release.ts:229-233` | Empty, explicitly incomplete, and production-blocking. Editorial work A-003. |
| 11 | Exact values | IMPLEMENTED_AND_VERIFIED | `math-ast.ts`; `locale-formatter.ts:11-39` | Integers use strings/BigInt; decimals use unscaled+scale. |
| 12 | Expression/step AST | IMPLEMENTED_AND_VERIFIED | `math-ast.ts`; `lesson.ts`; `variant-builder.ts:97-171` | Stable fact/check/step IDs exist. |
| 13 | SymPy protocol | IMPLEMENTED_BUT_UNVERIFIED | `protocol-schemas.ts:4-31`; Python `protocol.py` | Runtime identity is strict, but Python suite/environment unavailable. A-002. |
| 14 | TS-to-Python boundary | IMPLEMENTED_BUT_UNVERIFIED | `sympy-adapter.ts:82-237` | Fail-closed code exists; documented `.venv` missing. |
| 15 | Arithmetic | IMPLEMENTED_BUT_UNVERIFIED | `checks.py:158-188` | Source supports exact evaluate; fresh Python execution unavailable. |
| 16 | Algebraic equivalence | IMPLEMENTED_BUT_UNVERIFIED | `checks.py:167-170` | Same execution gap. |
| 17 | Fractions/signs | IMPLEMENTED_BUT_UNVERIFIED | Python AST/check fixtures; TS AST | Same execution gap. |
| 18 | Equations/systems | IMPLEMENTED_BUT_INCOMPLETE | `checks.py:170-177` | Solve supports exactly one symbol; systems are blocking unsupported. A-005. |
| 19 | Units/measurements | IMPLEMENTED_BUT_UNVERIFIED | `checks.py:27-50`; exact unit schema | Exact scale/dimension logic exists; no fresh Python result. |
| 20 | Geometry | IMPLEMENTED_BUT_INCOMPLETE | `checks.py:101-128` | Only six formulas; no broad volume/surface/trig coverage. A-005. |
| 21 | Functions/graph values | IMPLEMENTED_BUT_INCOMPLETE | `checks.py:53-99` | Exact interval point/slope only. Unsupported is safe. |
| 22 | Probability | IMPLEMENTED_BUT_INCOMPLETE | `checks.py:131-155` | Five rules only; no four-field-table model. A-005. |
| 23 | Unsupported handling | IMPLEMENTED_AND_VERIFIED | `checks.py:161-193`; adapter `208-218` | Unsupported/error cannot pass. |
| 24 | Hard math blocking | IMPLEMENTED_AND_VERIFIED | `quality-gate.ts:14-32,91-125,155-163` | Math has highest status priority and blocks render/publish. |
| 25 | Canonical German lesson | IMPLEMENTED_AND_VERIFIED | `localization.ts:91-147`; deterministic probe | German is canonical for supported fixtures. |
| 26 | Locked-fact localization | IMPLEMENTED_AND_VERIFIED | `fact-lock.ts`; `localization.ts:237-314` | Tokens, order, hashes, scene functions are locked. |
| 27 | `de/en/es/fr/pt` | IMPLEMENTED_AND_VERIFIED | `identity.ts:3`; five glossary files; probe | All five produced consistent semantic hashes. |
| 28 | Localized number formatting | IMPLEMENTED_AND_VERIFIED | `locale-formatter.ts:11-70`; probe | Display separators matched configured locales. |
| 29 | Glossary/TTS pronunciation | IMPLEMENTED_BUT_INCOMPLETE | `glossary.ts`; `tts-lexicon.ts`; formatter `73-119` | Operators/units controlled, but integers remain punctuation-formatted digits. F-107/A-007. |
| 30 | Post-localization consistency | IMPLEMENTED_BUT_UNVERIFIED | `display-verification.ts`; workflow localization artifacts | Integration could not run. |
| 31 | Formula-to-SVG boundary | IMPLEMENTED_BUT_UNVERIFIED | `math-components.ts`; `svg-cache.ts` | Typed deterministic implementation exists; render integration was skipped after bail. |
| 32 | Typed visual components | IMPLEMENTED_AND_VERIFIED | `math-components.ts`; unit source/contracts | Formula, number line, graph, geometry, table, probability contracts exist. |
| 33 | Grade presentation profiles | IMPLEMENTED_AND_VERIFIED | `profiles.ts` | Separate 5–7 and 8–10 profiles. |
| 34 | Teacher asset contract | IMPLEMENTED_AND_VERIFIED | `teacher.ts`; `assets/math-teacher/alex/v1/manifest.json` | Seven hashed placeholders; placeholder blocks publish, as required for safety. |
| 35 | 180–300 seconds | IMPLEMENTED_AND_VERIFIED | `timing.ts:11,157-166`; variant probe = 240 s | Boundary schemas are inclusive. |
| 36 | Narration/scene synchronization | IMPLEMENTED_BUT_UNVERIFIED | `timing.ts`; `composition.ts` | Integration did not reach render. |
| 37 | Idempotent stages | IMPLEMENTED_BUT_UNVERIFIED | `workflow.ts`; `pilot-resume.integration.test.ts` | Test skipped after verifier failure. |
| 38 | Atomic writes | IMPLEMENTED_AND_VERIFIED | `artifact-store.ts`; shared `writeJsonAtomic` | Same-directory lineage writes are implemented. |
| 39 | Resumable state | IMPLEMENTED_BUT_UNVERIFIED | `workflow.ts:137-167`; workflow tests | Source is fail-closed; integration did not run. |
| 40 | Isolated batch failures | IMPLEMENTED_BUT_UNVERIFIED | `batch.ts`; batch tests | Unit suite bailed before this file. |
| 41 | Retry budgets | IMPLEMENTED_BUT_UNVERIFIED | `batch.ts:140-179` | Bounded attempts exist; not freshly run. |
| 42 | Simulation mode | IMPLEMENTED_BUT_UNVERIFIED | `pilot-simulation.ts`; CLI `78-98` | Packaged entrypoint cannot dispatch. |
| 43 | No paid calls in simulation | IMPLEMENTED_AND_VERIFIED | Workflow schema requires `paidProviderCalled:false`; CLI has no live math provider | No provider/network call occurred in audit. |
| 44 | Debug request/response logging | NOT_IMPLEMENTED | No math debug logger integration found | Required observability absent. A-006. |
| 45 | Exclude Base64 from logs | IMPLEMENTED_BUT_UNVERIFIED | No math debug sink; Base64 exists only inside SVG assets | No leak observed, but there is no sink/redaction test. |
| 46 | Metrics/correlation IDs | NOT_IMPLEMENTED | No `@mediaforge/observability` import in math packages/command | F-105/A-006. |
| 47 | Metadata generation | IMPLEMENTED_BUT_UNVERIFIED | `math-metadata.ts:515-657` | Strong release/workflow/timing binding exists in dirty repair; unit run stopped earlier. |
| 48 | Playlist assignment | IMPLEMENTED_BUT_UNVERIFIED | `math-metadata.ts:23-162,605-656` | Stable keys exist; CLI unavailable. |
| 49 | Thumbnail specification | IMPLEMENTED_BUT_INCOMPLETE | `math-thumbnail.ts:475-516`; failing unit | German fixture overflows; checked-in placeholder is non-publishable. F-104/A-004. |
| 50 | Dry-run publishing manifest | IMPLEMENTED_BUT_UNVERIFIED | `dry-run-manifest.ts:11-143`; CLI `460-697` | Strict zero-call manifest exists, but command cannot dispatch. |
| 51 | Quality status machine | IMPLEMENTED_AND_VERIFIED | `quality-gate.ts:14-173`; CLI source | Complete mandatory gate set and fail-closed exit mapping. |
| 52 | Horror backward compatibility | CONTRADICTS_REQUIREMENTS | Packaged horror help exits 1; `index.ts:148-151,4957`; package main | Critical regression F-101/A-001. |
| 53 | Pilot vertical slice | NOT_IMPLEMENTED | All pilot commands exit before dispatch; empty temp workspace | No auditable end-to-end output. F-102/A-009. |
| 54 | Test coverage | IMPLEMENTED_BUT_INCOMPLETE | Tests exist across packages; current runs red/skipped | Matrix is not a green release gate. F-108/A-008. |
| 55 | Docs/operational commands | IMPLEMENTED_BUT_INCOMPLETE | CLI command tree and Python README | Published CLI command is unusable; offline wheelhouse absent. |

## 6. Curriculum integrity

All Markdown files decoded as UTF-8. The seed contains exactly one JSON fence, parses as schema version 1, has 206 unique IDs, exact documented grade counts, and exactly `foundation`, `standard`, `challenge` per skill. The normalized release also has 206 skills and hash-bound input files.

`release.json` is a draft. All skill source mappings are `pending`; source content hashes are absent. `prerequisites.json` explicitly limits itself to 19 conservative reviewed edges and reports disconnected nodes as unresolved. `state-overrides.json` contains zero overrides and explicitly blocks binding state claims. `loadCurriculumRelease` correctly computes `readyForProduction=false` until release, provenance, graph, and overrides are reviewed (`release.ts:229-233`). These are truthful deferrals, not false success.

Cycle paths, unknown edges, self edges, duplicate edges, future-grade approvals, and stable ordering are implemented in `dag.ts:40-148`. Their tests were not reached in the bailed unit run.

## 7. Mathematical verifier assessment

The TS/Python v2 protocol binds protocol, verifier, SymPy, request ID, input hash, check count, and check IDs. Spawn errors, nonzero exit, stderr-on-success, output bounds, malformed JSON, version mismatch, identity mismatch, failed, unsupported, and error all fail closed (`sympy-adapter.ts:82-237`). Exact values avoid JavaScript floats.

Source supports arithmetic, equivalence, one-variable equations, exact unit conversions, interval graph points/slopes, six geometry formulas, and basic probability rules. Equation systems, broader 3D/trigonometric geometry, and richer statistics/probability are unsupported and therefore blocking. No LLM boolean can bypass the adapter or quality gate.

Fresh execution evidence is unavailable: `.venv/bin/python` does not exist, system Python lacks SymPy and pytest, and the integration run failed on spawn. Thus no mathematical domain is classified fully verified by this audit.

## 8. Variant assessment

The built-module probe for `M5-ZO-001` produced one shared objective and three 240-second variants. Foundation has two worked examples, high scaffolding, slowed pacing, bounded numbers, guided transfer, and solution `50802`. Standard has one example, balanced pacing, grade-level numbers, independent application, and solution `604070`. Challenge has compressed pacing, extended numbers, novel transfer, and solution `63008009`. Scene-duration vectors differ materially. The variants are more than number-only rewrites, although only three skills have approved fixtures.

## 9. Localization assessment

The Standard lesson produced `de`, `en`, `es`, `fr`, and `pt` artifacts with identical objective hash, fact-lock hash, semantic fact hashes, LaTeX, scene purposes, and order. Display grouping matched configured `de-DE`, `en-US`, `es-419`, `fr-FR`, and `pt-BR` profiles. Missing/reordered/duplicate facts and glossary misses throw.

TTS risk remains: integer spoken forms are the same grouped digit strings as display (`locale-formatter.ts:79-85`), rather than lexical number words or SSML. Punctuation interpretation therefore depends on the voice/provider. Decimal operators and unit terms are controlled.

## 10. Rendering assessment

Structured AST, deterministic SVG cache inputs, semantic scene contracts, two age profiles, safe-area rules, teacher hash/pose/area validation, mock audio timing, Remotion, and FFmpeg media QA exist. Continuous lip sync is not required. The checked-in seven-pose teacher set is explicitly `alex.v1-placeholder`; thumbnail code rejects placeholder manifests (`math-thumbnail.ts:493-497`). Rendering integration was skipped after the verifier failure, and the German thumbnail fixture currently fails width validation.

## 11. Orchestration and resilience assessment

Workflow v2 defines 15 ordered stages with exact parent fingerprints, per-output hashes/byte lengths/schema versions/identities, path containment, atomic writes, quarantine, bounded retries, batch checkpoints, and fail-closed quality. Static inspection found no unbounded concurrency or non-atomic math artifact write. Resume, interruption, diagram failure, localization failure, verifier failure, and mixed batch behavior have tests, but this audit could not execute them after the integration environment failure.

## 12. Observability and security assessment

No math package or math command imports `@mediaforge/observability`; correlation ID, skill/variant/language/stage context, provider/model, retry duration, token/cost metrics, and bounded debug request/response artifacts are absent. Workflow state has lesson IDs, stages, attempts, and error categories but not the required diagnostic envelope.

Static searches found no API keys, authorization headers, credentials, environment dumps, `@ts-ignore`, `@ts-expect-error`, or empty catches in math production source. Base64 is embedded in deterministic SVG/font assets, not logs. Because no math debug sink exists, Base64 redaction is unverified rather than proven.

## 13. Horror-pipeline regression assessment

**Failed.** `apps/cli/src/index.ts` statically imports/registers math commands. `packages/math-education/package.json:6` points `main` to `./src/index.ts`, so plain Node crashes on the `.ts` extension before parsing any command. `stories production batch --help` and even root `--help` exit 1. This is a Critical backward-compatibility regression regardless of whether horror unit code remains unchanged.

## 14. Simulated pilot results

**Failed before dispatch.** The exact command and quality, metadata, status, and publish dry-run follow-ups all exited 1 with `ERR_UNKNOWN_FILE_EXTENSION`. The explicit `/tmp` workspace stayed empty. No paid provider, network, rendering-provider, or YouTube call occurred.

An internal built-module probe established variant and locale behavior only; it is not an accepted CLI pilot. A full pilot would additionally be blocked by the missing verifier environment and the non-publishable teacher/thumbnail gate.

## 15. Findings by severity

### Critical

#### F-101 — Math package runtime export breaks every packaged CLI workflow

- Requirement: 52, backward compatibility; operational CLI.
- References: `packages/math-education/package.json:6`; `apps/cli/src/index.ts:148-151,4953-4957`.
- Evidence: both math and horror packaged commands exit 1 with `ERR_UNKNOWN_FILE_EXTENSION` before dispatch, even after `pnpm build` passes.
- Impact: all production workflows using `apps/cli/bin/mediaforge.js` are unavailable.
- Fix: export runtime JavaScript from `dist`, keep types separately, add package/export smoke tests before root command registration.
- Fix verification: build, run root/horror/math `--help`, curriculum validate, and packaged CLI characterization tests from a clean checkout.

### High

#### F-102 — The independent verifier is not provisioned, so no pilot can verify mathematics

- Requirement: 13–22, 53.
- References: `python/math-verifier/README.md:3-20`; `sympy-adapter.integration.test.ts`; `sympy-adapter.ts:89-104`.
- Evidence: `.venv/bin/python ENOENT`; system Python has neither SymPy nor pytest.
- Impact: verification stage cannot run; all downstream work must block.
- Fix: provide/test the hash-locked offline wheelhouse and CI/bootstrap contract without network at runtime.
- Fix verification: Python suite plus all adapter crash/timeout/version/domain integration cases.

#### F-103 — Production curriculum and lesson coverage remain deliberately partial

- Requirement: 1, 7, 10, 18–22, 53.
- References: `release.ts:229-233`; `prerequisites.json:1-8`; `state-overrides.json:1-5`; `capabilities.ts:3-25`; `lesson-specification-fixtures.ts:61-126`.
- Evidence: draft release, pending provenance, 19 edges, zero overrides, and only three approved Class-5 skills.
- Impact: the system cannot truthfully operate across grades 5–10 or most mathematical domains.
- Fix: finish editorial release review and expand supported lesson/verifier capabilities in explicit rollout slices.
- Fix verification: real-release validation plus capability/domain coverage matrix with unsupported skills excluded before execution.

#### F-104 — Thumbnail and teacher gates prevent a READY pilot

- Requirement: 34, 49, 53.
- References: `assets/math-teacher/alex/v1/manifest.json:2-5`; `math-thumbnail.ts:493-516`; `math-thumbnail.unit.test.ts:233-243`.
- Evidence: German locale test fails width validation; checked-in `alex.v1-placeholder` is explicitly rejected.
- Impact: no complete thumbnail/publish packet or READY pilot can be produced from repository assets.
- Fix: define accepted simulation-placeholder versus publish-ready behavior, repair measured locale layout, and retain hard public-release blocking.
- Fix verification: all five locale bounds, long/formula overflow, placeholder simulation, publish rejection, and deterministic asset tests.

#### F-106 — Required mathematical domains are only partially implemented

- Requirement: 18, 20–22.
- References: `checks.py:101-155,170-187`.
- Evidence: solve rejects more than one symbol; geometry is limited to six formulas; graph and probability models cover narrow rule subsets.
- Impact: most upper-grade curriculum cannot be independently verified, though unsupported cases safely block.
- Fix: add domain-specific evidence schemas/checkers incrementally; never generalize through caller-supplied expected values.
- Fix verification: equation systems, volume/surface/trigonometry, function domains, probability trees/path sums/four-field tables, and adversarial expected-value tests.

### Medium

#### F-105 — Required math observability and debug evidence are absent

- Requirement: 44–46.
- References: no observability import in `packages/math-education`, `packages/math-rendering`, or `apps/cli/src/math-commands.ts`; `workflow.ts:128-145`.
- Evidence: static search found no correlation ID or structured math telemetry integration.
- Impact: retries, costs, provider safety, and failures cannot be traced end to end.
- Fix: implement bounded redacted telemetry/debug contracts and link IDs into state.
- Fix verification: context completeness, cost-null warning, secret/header/Base64/binary redaction, and size limits.

#### F-107 — Spoken integer forms depend on provider punctuation interpretation

- Requirement: 29.
- References: `locale-formatter.ts:73-88`; `tts-lexicon.ts:13-151`.
- Evidence: integers return locale-grouped digits unchanged as spoken text (`730.405`, `730,405`, `730 405`).
- Impact: TTS can pronounce grouping as a decimal or pause inconsistently by voice/locale.
- Fix: deterministic lexical or SSML number realization with locale-reviewed policies.
- Fix verification: five-locale integer/decimal/negative/fraction/unit audio-token goldens.

#### F-108 — The release verification matrix is not executable green evidence

- Requirement: 54–55.
- References: `math-genre-test-matrix.md`; command results in sections 3–4.
- Evidence: unit and integration runs stop at current failures; Python tests cannot start; root E2E was not run; pilot/horror commands fail.
- Impact: regressions in unexecuted DAG, batch, localization, render, and upload cases remain possible.
- Fix: restore prerequisites, then run dependency-ordered focused gates and only afterward authorized broad release gates.
- Fix verification: record exact pass/skip counts for C01–H04 in a clean environment.

### Low

#### F-109 — Formatting and lint gates are red

- Requirement: 55 and implementation execution rule 4.
- References: math lint errors in `artifact-store.ts:63,86`, `batch.ts:103`, `math-workspace-paths.ts:41`, `workflow.ts:256,453`, `sympy-adapter.ts:64,73`; formatting command output.
- Evidence: `pnpm lint` reports 12 errors; `pnpm format:check` reports 626 files.
- Impact: quality gates are noisy and cannot serve as release evidence.
- Fix: isolate pre-existing baseline, format affected files, and configure Node globals/types without weakening lint.
- Fix verification: affected-file Prettier/ESLint first, then root gates.

## 16. Unsupported or incomplete capabilities

- Production-ready curriculum release, complete provenance, state overrides, and reviewed prerequisite coverage.
- Lessons beyond three approved Class-5 skills.
- Equation systems and broad upper-grade geometry/functions/probability.
- Executable offline Python environment in this checkout.
- Math debug request/response logs, metrics, correlation IDs, and cost tracking.
- Publish-ready teacher asset and a passing five-locale thumbnail gate.
- A packaged CLI, accepted simulated pilot, and green horror compatibility gate.

## 17. Required fixes before any paid pilot

Complete A-001 through A-008 in `remediation-backlog.md`, then execute A-009. Paid providers and publishing must remain disabled until the re-audit has no Critical or High findings and the pilot plus horror gates pass.

## 18. Recommended improvements after the pilot

Expand curriculum/domain coverage in reviewed slices; add lexical/SSML math speech review per locale; add deterministic render baselines for both age profiles; and introduce cost/performance dashboards only after redaction tests are green.

## 19. Exact next command after remediation

```bash
node apps/cli/bin/mediaforge.js stories production batch --help && node apps/cli/bin/mediaforge.js math curriculum validate
```
