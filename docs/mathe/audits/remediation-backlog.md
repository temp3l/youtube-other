# Mathematics genre remediation backlog

Source audit: `docs/mathe/audits/post-implementation-verification.md`  
Order is strict. Do not start a task until all earlier tasks are accepted. No task authorizes paid providers, remote rendering, live credentials, or publishing.

## A-001 — Restore packaged CLI and horror compatibility

- Related findings: F-101.
- Objective: make workspace packages resolve built JavaScript under plain Node without loading `.ts`, and restore every existing CLI command before math dispatch.
- Expected files: `packages/math-education/package.json`, possibly package export maps/build config, packaged CLI smoke tests.
- Constraints: preserve source types and ESM; no runtime TS loader; do not change horror defaults or command names.
- Acceptance criteria: clean build followed by root, horror, and math help succeeds; curriculum validate/import dry-run dispatches; absence of math `dist` fails with an actionable build error rather than breaking unrelated commands if lazy registration is chosen.
- Required tests: package import smoke from a copied/packed workspace; `test:cli-packaged`; existing horror help characterization; math CLI real-entrypoint test.
- Regression risk: workspace test resolution may differ from packaged resolution.
- Rollback guidance: feature-disable/lazily load math registration while retaining horror CLI; never ship the current global crash.
- Recommended Codex model and reasoning: GPT-5/Codex, high.

## A-002 — Provision and verify the offline SymPy environment

- Related findings: F-102, F-108.
- Objective: make the documented verifier and Python tests reproducibly executable without runtime network.
- Expected files: `python/math-verifier/{requirements.lock,setup-offline.sh,prepare-wheelhouse.sh,README.md}`, CI/bootstrap configuration only if required.
- Constraints: hash-locked wheels; pinned Python/SymPy/pytest; no broad executable allowlist; runtime network disabled.
- Acceptance criteria: clean checkout can install from the approved wheelhouse, run pytest, and run the TS adapter with the configured executable.
- Required tests: full Python suite; adapter success, crash-before-stdin, timeout/descendant kill, output bounds, noisy/malformed/version/hash mismatch.
- Regression risk: OS/Python ABI differences.
- Rollback guidance: disable all math verification/downstream stages; never fall back to caller booleans or floating-point checks.
- Recommended Codex model and reasoning: GPT-5/Codex, high.

## A-003 — Complete a truthful reviewed curriculum rollout slice

- Related findings: F-103.
- Objective: promote only reviewed curriculum/provenance/DAG/override data and explicitly scope production capabilities.
- Expected files: `packages/math-education/data/curriculum/v1/*.json`, curriculum schemas/tests, editorial review evidence.
- Constraints: do not rewrite published IDs; append-only migrations; official source hashes/provenance; no binding state claim without review.
- Acceptance criteria: selected pilot release is reviewed, source mappings complete for the rollout slice, prerequisite/disconnected policy approved, and state override status resolved or explicitly out of rollout scope.
- Required tests: real-release schema/hash/provenance; unknown fields/enums; duplicate IDs; dangling/self/parallel/cycle with useful path; stable order; override restrictions.
- Regression risk: curriculum and downstream artifact hashes change.
- Rollback guidance: pin the prior draft and keep production/publish disabled.
- Recommended Codex model and reasoning: GPT-5/Codex, high.

## A-004 — Finish and independently accept thumbnail/teacher pilot behavior

- Related findings: F-104.
- Objective: produce deterministic five-locale simulation thumbnails while retaining a hard block for public placeholder artwork.
- Expected files: `packages/math-rendering/src/thumbnail/*`, teacher asset contract/fixtures, math metadata/publish integration tests.
- Constraints: measured font/formula bounds; workflow-owned verified fact; no horror thumbnail dependency; placeholder must never become publish-ready by boolean override.
- Acceptance criteria: all five locale fixtures fit; long text/formula overflow rejects; simulation placeholder is explicit and quality-classified; publish preflight rejects placeholder; approved assets require hash/license/provenance.
- Required tests: locale matrix, font/hash/teacher swaps, fact transplant, deterministic bytes, simulation vs publish status, CLI dry-run packet.
- Regression risk: content hashes and fixture dimensions change.
- Rollback guidance: disable thumbnail/publish stages and preserve upstream artifacts.
- Recommended Codex model and reasoning: GPT-5/Codex, high.

## A-005 — Expand deterministic mathematical domain coverage

- Related findings: F-103, F-106.
- Objective: support the next reviewed curriculum slices without weakening unsupported-case blocking.
- Expected files: Python AST/check/protocol modules, TS schemas, domain fixtures/tests.
- Constraints: independent truth derivation; exact arithmetic; explicit assumptions/domains/units; no caller expected-value tautology.
- Acceptance criteria: equation systems, required geometry/measurement, function/graph, and probability models for the approved rollout are independently checked; everything else is explicit `unsupported`.
- Required tests: valid/invalid systems; surface/volume/trig cases; domain and slope attacks; probability trees/path sums/four-field totals; division by zero and malformed nodes.
- Regression risk: protocol/cache hashes and old verification results change.
- Rollback guidance: version the protocol and quarantine old results; disable newly unsupported lesson capabilities.
- Recommended Codex model and reasoning: GPT-5/Codex, high.

## A-006 — Add structured math observability and redaction

- Related findings: F-105.
- Objective: attach complete, bounded, redacted diagnostic evidence to every stage and boundary.
- Expected files: observability math context/types, workflow/batch/verifier/render/CLI integrations, debug sink tests.
- Constraints: correlation/batch/release/skill/lesson/variant/language/stage/provider/model/version/attempt/duration/cache/cost; unknown cost is null plus warning; never log secrets, headers, environment dumps, Base64, or binary.
- Acceptance criteria: every success/failure/retry has context and stable error category; state links correlation IDs; debug payloads are bounded and redacted.
- Required tests: context completeness, retry/duration/cost, unknown pricing, API key/token/header/Base64/binary/oversize redaction.
- Regression risk: log volume and accidental disclosure.
- Rollback guidance: disable debug sink while retaining minimal redacted errors and correlation IDs.
- Recommended Codex model and reasoning: GPT-5/Codex, high.

## A-007 — Make mathematical speech deterministic per locale

- Related findings: F-107.
- Objective: remove provider-dependent interpretation of grouped integer strings.
- Expected files: `locale-formatter.ts`, `tts-lexicon.ts`, glossary/locale fixtures and tests.
- Constraints: preserve semantic hashes and display formatting; region policies remain explicit; missing realization fails visibly.
- Acceptance criteria: integers, negatives, decimals, rationals, powers, roots, and units produce locale-reviewed lexical or SSML speech independent of punctuation guessing.
- Required tests: five-locale display/spoken goldens, large integers, decimal zeros, signs, fractions, units, unsupported symbol/function pronunciation.
- Regression risk: TTS fingerprints/audio caches invalidate.
- Rollback guidance: pin old speech version only with TTS/render/publish disabled for affected locales.
- Recommended Codex model and reasoning: GPT-5/Codex, high.

## A-008 — Establish green release and compatibility gates

- Related findings: F-108, F-109.
- Objective: make the approved C01–H04 matrix and repository quality commands reproducibly green.
- Expected files: focused missing tests, affected lint/format configuration or source-only cleanup, CI command documentation.
- Constraints: classify pre-existing failures; no weakened assertions, broad snapshots, or fixture regeneration; obey focused-test budgets during repair.
- Acceptance criteria: affected Prettier/ESLint, math unit/integration/Python/render/CLI/E2E, packaged CLI, typecheck, build, and H01–H04 pass; root noise is fixed or formally quarantined with owner/expiry.
- Required tests: exact matrix C01–H04, including corruption, interruption/resume, provider-zero, and horror defaults.
- Regression risk: broad repository failures obscure ownership.
- Rollback guidance: revert only isolated repairs; retain characterization tests and fail-closed gates.
- Recommended Codex model and reasoning: GPT-5/Codex, high.

## A-009 — Re-run independent provider-free pilot acceptance

- Related findings: F-101 through F-109.
- Objective: independently demonstrate a complete resumable `M5-ZO-001-standard-de` vertical slice and five-locale locks.
- Expected files: audit/report artifacts only unless a separately approved defect is found; temporary pilot workspace outside tracked data.
- Constraints: no credentials, network, paid provider, remote renderer, upload, or channel mutation; do not accept implementation reports as evidence.
- Acceptance criteria: curriculum, lesson/variants, verifier, German narration, five locales, mock TTS, synchronized scenes, semantic visuals, FFmpeg-valid media, metadata/playlists, quality, state/resume, and publish dry-run all pass; second run is cached; zero provider/mutation calls; horror gates pass.
- Required tests: exact CLI pilot and follow-ups; missing artifact; diagram/verifier/localization/batch failure; interruption/resume; dry-publish zero mutation.
- Regression risk: fixture overfitting or host render nondeterminism.
- Rollback guidance: keep math rollout/publish disabled and archive only non-secret failure evidence.
- Recommended Codex model and reasoning: GPT-5/Codex, high.
