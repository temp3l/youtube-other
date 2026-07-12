# Mathematics genre remediation backlog

Source audit: `docs/mathe/audits/post-implementation-verification.md`  
Order is strict: do not start a task until all earlier tasks are accepted. No task authorizes paid providers or publishing.

## R-001 — Make mathematical domain verification independently sound

Status: accepted 2026-07-12 after independent source review and focused verification.

- Related findings: F-001.
- Objective: replace generic equality with domain-specific unit, geometry, graph/function, and probability verification.
- Expected files: `python/math-verifier/src/math_verifier/{ast,checks,protocol}.py`, Python fixtures/tests, matching TS protocol/domain schemas.
- Constraints: exact arithmetic only; expected values from generated content are never sufficient evidence; unsupported remains blocking; protocol v1 compatibility or explicit v2 migration.
- Acceptance criteria: wrong magnitude with matching unit dimensions fails; probability values/totals outside valid bounds fail; graph points require function/domain/point; geometry requires declared formula/entity assumptions.
- Required tests: unit scale/conversion matrix, probability normalization/path rules, graph points/slopes, geometry formulas, wrong-expected-value attacks, division by zero, malformed/unsupported cases.
- Regression risk: verifier results and cached hashes change. Rollback: pin previous worker only with math publish disabled and old results quarantined.
- Recommended Codex model: GPT-5/Codex, high reasoning.

## R-002 — Harden and provision the TypeScript–Python boundary

Status: accepted 2026-07-12 after source review, focused boundary verification, and observed descendant termination.

- Related findings: F-008.
- Objective: provide a reproducible local verifier environment and make every process outcome controlled and fail-closed.
- Expected files: `python/math-verifier/pyproject.toml` plus lock/setup script, `sympy-adapter.ts`, protocol schemas, integration fixtures.
- Constraints: no broad executable allowlist; no network at runtime; bounded stdout/stderr; exactly one settlement; kill process group; no silent stderr success; validate verifier/SymPy versions.
- Acceptance criteria: default documented command installs/runs offline from lock; early exit cannot emit uncaught `EPIPE`; timeout ends within tolerance; crash/noisy/malformed/version-mismatched output becomes structured blocking error.
- Required tests: crash before stdin, nonzero exit, timeout with descendant process, output limits, malformed/multiple JSON, identity/version/hash mismatch, stderr policy, equation-system supported-or-explicitly-unsupported behavior.
- Regression risk: platform-specific spawn behavior. Rollback: feature-disable math verification and therefore all downstream/publish stages.
- Recommended Codex model: GPT-5/Codex, high reasoning.

## R-003 — Complete curriculum release, provenance, overrides, and reviewed DAG

Status: accepted 2026-07-12 after independent source/data review, focused
release and DAG tests, read-only CLI verification, and package typechecks.

- Related findings: F-004, F-017.
- Objective: make the normalized curriculum release a truthful, versioned production source.
- Expected files: curriculum release/registry/skills/overrides/prerequisites data; curriculum loaders, provenance gate, DAG diagnostics; curriculum CLI/tests.
- Constraints: published IDs immutable; append-only migrations; include every documented official source; no binding claim from pending/unverified mapping; do not alter the Markdown seed.
- Acceptance criteria: all 206 skills have reviewed/explicitly incomplete provenance; real reviewed prerequisite edges load; zero cycles/dangling/self/duplicate edges; disconnected nodes are intentional and reported; stable topological order and useful cycle path.
- Required tests: real release validation, source/cohort/override negatives, hash immutability, ID migrations, cycle-path/parallel-edge/disconnected fixtures, CLI import dry-run with zero writes.
- Regression risk: playlist order and curriculum hashes change. Rollback: pin last reviewed draft release; never rewrite a published release.
- Recommended Codex model: GPT-5/Codex, high reasoning.

## R-004 — Rebuild artifact lineage, workflow state, resume, and batch checkpoints

Status: accepted 2026-07-12 after independent adversarial review added
schema-bound artifacts, earliest-invalid-stage resume, downstream-only repair,
focused tests, real Python integration, and package typechecking.

- Related findings: F-002, F-011, F-014.
- Objective: make every stage and batch item atomically resumable from schema- and hash-valid outputs.
- Expected files: artifact store, workflow manifest/store/invalidation, batch runner/report, workspace resolver, CLI artifact readers, tests.
- Constraints: containment and symlink checks; same-directory atomic rename; per-stage output hashes/parent hashes; item checkpoints before continuing; no duplicate provider request on resume.
- Acceptance criteria: missing/truncated/hash-wrong output is never cached; only transitive dependents stale; interruption preserves completed items; retryable/permanent errors and bounded attempts persist; malformed manifests quarantine visibly.
- Required tests: delete/truncate/swap every output, parent mutation, interrupted batch, mixed failures, retry exhaustion, concurrent lock, traversal/symlink escape, unchanged resume with zero writes/calls.
- Regression risk: v1 manifests become unreadable. Rollback: retain v1 reader/migrator and disable newer writer; never reinterpret corrupt state as success.
- Recommended Codex model: GPT-5/Codex, high reasoning.

## R-005 — Implement genuine lesson generation and variant semantics

Status: implemented 2026-07-12; focused verification passed; pending
independent acceptance before R-006 starts.

- Related findings: F-003, F-010.
- Objective: replace the hard-coded pilot with strict generation ports/fixtures and materially differentiated variants.
- Expected files: lesson builders/validators/prompts/fixtures, domain schemas, batch planner, tests.
- Constraints: one narrow shared objective; independently verified common facts; complete in-lesson challenge solution; variants differ in scaffolding, pacing, number complexity, representation, and transfer, not labels alone.
- Acceptance criteria: pilot variants have distinct timing/content structures and non-repeated challenges; unsupported skills are excluded by rollout capability before batch execution; approved number, geometry, and data candidates work in simulation.
- Required tests: near-duplicate semantic detector, objective/fact invariants, challenge completeness, process competency scene, duration, three representative domain fixtures, batch capability planning.
- Regression risk: lesson/content hashes and fixtures change. Rollback: pin approved lesson producer version and invalidate only dependent artifacts.
- Recommended Codex model: GPT-5/Codex, high reasoning.

## R-006 — Enforce locked-fact localization and deterministic math speech/display

- Related findings: F-005, F-014.
- Objective: preserve every mathematical fact/step/solution/scene across `de`, `en`, `es`, `fr`, and `pt` and produce controlled display and speech forms.
- Expected files: fact-lock/localizer/formatter/glossary/TTS lexicon modules, glossary data, locale schemas, fixtures/tests.
- Constraints: canonical German semantics; no locale may modify AST/order/variant; glossary misses fail visibly; decimals/rationals/units remain semantic objects; region choices explicit.
- Acceptance criteria: all tokens resolve; exact display and spoken artifacts exist; lock covers objective, step order, examples, challenge, solutions, scene purpose, and hashes; post-localization display facts rerun through verifier; all metadata language surfaces match locale.
- Required tests: five-locale golden tables for integers/decimals/fractions/signs/units, missing/duplicate/reordered token, changed solution/scene, glossary miss/false friend, formula pronunciation, post-verification failure.
- Regression risk: locale and TTS fingerprints invalidate. Rollback: pin prior glossary/formatter version and mark only affected locale descendants stale.
- Recommended Codex model: GPT-5/Codex, high reasoning.

## R-007 — Implement semantic visuals, TTS, timing reflow, render, and media QA

- Related findings: F-006, F-015.
- Objective: produce deterministic formula/diagram assets, mock audio, synchronized Remotion output, and FFmpeg-validated media.
- Expected files: distinct visual component schemas/renderers/cache, Remotion composition/runner, math TTS stage, timing reflow, teacher asset adapter, FFmpeg gate, fixtures/tests.
- Constraints: structured AST input only; no untrusted LaTeX; fact IDs on every displayed value; teacher ≤25%; continuous lip sync not required; no paid or remote renderer; safe-area/readability failures block.
- Acceptance criteria: formula output is deterministic SVG/cache-keyed; number line/graph/geometry/table/probability components use semantic values; mock TTS drives frames; 1920×1080/30fps/180–300s MP4 passes audio/video/continuity validation.
- Required tests: component negatives, deterministic hashes, both age profiles, missing teacher/diagram, cue drift, 179/180/300/301 boundaries, small local Remotion render, FFmpeg validation, corrupt media.
- Regression risk: heavy dependencies and nondeterministic fonts/browser. Rollback: disable math render feature; never fall back to story renderer or accept placeholders as ready.
- Recommended Codex model: GPT-5/Codex, high reasoning.

## R-008 — Make quality and CLI outcomes strictly fail-closed

- Related findings: F-006, F-007.
- Objective: derive status only from a complete versioned gate set and map it correctly to render/publish permissions and exit codes.
- Expected files: quality gate/approval schemas, CLI production/quality/status handlers, workflow integration, tests.
- Constraints: empty/missing/duplicate checks block; `MATHEMATICAL_ERROR` never overrideable; minor approval is versioned and second-reviewer-bound; all upstream errors block render; only validated media can be ready.
- Acceptance criteria: skipped audio/render produces `RENDER_BLOCKED`; single-locale selection is assessed against selected scope; blocked quality returns documented nonzero exit; no free boolean/manual status mutation.
- Required tests: complete priority matrix, empty/missing/duplicate gates, every render/publish status, approval manipulation, selection-aware locales, CLI exit 0/1/2/3.
- Regression risk: automation relying on current exit 0 will stop. Rollback: no permissive rollback; disable commands until consumers adopt correct exits.
- Recommended Codex model: GPT-5/Codex, high reasoning.

## R-009 — Complete metadata, thumbnail, playlists, and safe publish dry run

- Related findings: F-009.
- Objective: create fully localized metadata/thumbnail assets and a non-mutating, executable publish preflight.
- Expected files: metadata schema/generator/catalog, thumbnail component/renderer, generic upload core and legacy wrapper only if plan-approved, CLI publish options/tests.
- Constraints: preserve horror wrapper/defaults; explicit math channel/policy; private default; stable keys and idempotent playlist assignments; dry run cannot instantiate a live client.
- Acceptance criteria: five-locale title/description/chapters/tags; DAG neighbors; grade/topic/variant catalog; 2–5-word readable thumbnail asset; `--dry-run` works and records zero mutations; missing channel/made-for-kids/privacy/playlist policy blocks.
- Required tests: locale metadata, thumbnail safe area/text, catalog misses, option parsing, fake YouTube channel mismatch/multiple playlists/idempotency, legacy upload characterization.
- Regression risk: shared upload API. Rollback: keep legacy wrapper byte-compatible and feature-disable math publish.
- Recommended Codex model: GPT-5/Codex, high reasoning.

## R-010 — Add structured observability and security/redaction gates

- Related findings: F-013.
- Objective: attach actionable, bounded, redacted telemetry/debug evidence to every math stage and boundary.
- Expected files: math telemetry context/types, workflow/batch/verifier/render/provider integrations, debug logger tests.
- Constraints: include correlation/batch/release/skill/lesson/variant/language/stage/provider/model/version/attempt/duration/cache/cost; unknown price is null+warning; never log credentials, authorization, environment dumps, Base64, or binary.
- Acceptance criteria: every success/failure/retry has complete context and stable category; state links correlation IDs; debug request/response is size-bounded and redacted; costs aggregate per finished video.
- Required tests: context completeness, error categories, retry/duration/cost, unknown price, secret/header/token/Base64/binary redaction, oversized payload rejection.
- Regression risk: log volume or accidental sensitive output. Rollback: disable debug sink while retaining minimal redacted structured errors.
- Recommended Codex model: GPT-5/Codex, high reasoning.

## R-011 — Establish green math, repository, and horror release gates

- Related findings: F-012, F-016, F-018.
- Objective: implement the approved test matrix and establish an independently green compatibility baseline without weakening assertions.
- Expected files: focused math unit/integration/E2E tests, existing failing test owners’ files only in separately approved repairs, CI/setup docs, formatting/lint baselines.
- Constraints: classify every existing failure before edit; no broad snapshots/fixtures; keep math changes separate from pre-existing horror repairs; no provider/network calls.
- Acceptance criteria: math unit/integration/Python/render/CLI/E2E pass in documented clean environment; H01–H04 pass; `pnpm test:unit`, `pnpm test:integration`, packaged CLI, build, typecheck, targeted lint/format are green or formally quarantined with owner/expiry.
- Required tests: entire approved matrix C01–H04, including false-positive and state-corruption regressions from this audit.
- Regression risk: unrelated dirty-tree failures obscure ownership. Rollback: revert only the isolated failing repair; retain added characterization tests.
- Recommended Codex model: GPT-5/Codex, high reasoning.

## R-012 — Re-run and approve the offline pilot gate

- Related findings: F-001 through F-018.
- Objective: independently demonstrate a complete, resumable, provider-free `M5-ZO-001-standard-de` vertical slice after remediation.
- Expected files: pilot fixtures/E2E test and the required plan/codex implementation reports; no generated curriculum/source edits.
- Constraints: explicit temporary workspace; deterministic local mocks; no credentials/network/publishing; audit artifact hashes and command outputs.
- Acceptance criteria: curriculum/provenance/DAG, lesson/variants, verifier, canonical German, five locale locks, mock TTS, synchronized scene plan, formula/diagram/thumbnail, FFmpeg-valid media, metadata/playlists, quality `READY`, state/resume, dry publish manifest; second run is fully cached and validates outputs; horror gates pass.
- Required tests: pilot E2E, missing-output resume, one diagram/verifier/localization/batch failure, process interruption/resume, zero provider dispatch, dry publish zero mutations.
- Regression risk: pilot fixture overfitting. Rollback: keep rollout feature disabled and archive the failed workspace for diagnosis.
- Recommended Codex model: GPT-5/Codex, high reasoning.
