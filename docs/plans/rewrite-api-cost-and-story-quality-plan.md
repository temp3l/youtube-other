# Rewrite API Cost And Story Quality Plan

## Summary

- Extend the existing `packages/story-localization` StoryIR/canonical-facts/short-contract path instead of adding a parallel pipeline.
- Add a typed generation contract for artifact budgets, canonical facts, quality gates, findings, and repair scopes.
- Make `story-facts.json` the compact input contract for localization and Shorts while retaining existing cache compatibility.
- Replace weak Shorts prompting and acceptance with deterministic quality gates, deterministic fixes, and one targeted repair before rejection.
- Update cost-safe defaults, warnings, docs, tests, and the required Codex run report.

## Key Changes

- Add contract types in `packages/story-localization/src/story-generation-contracts.ts` and export them from `index.ts`: `StoryArtifactKind`, `StoryGenerationBudget`, extended `CanonicalStoryFacts`, `StoryQualityGateResult`, `StoryQualityFinding`, and `RepairScope`.
- Extend the current `CanonicalStoryFacts` shape additively with `protagonistNames`, `locationAnchors`, `threatMotifs`, `keyRules`, `forbiddenInventions`, `requiredFinalReveal`, and `requiredFinalLine`; normalize old cached facts by deriving safe defaults from current `characters`, `setting`, `criticalObjects`, `threat`, `primaryReveal`, and `finalConsequence`.
- Add `story-facts.json` persistence under `episodes/<slug>/story-facts.json` with a schema/version/hash, source full-story hash, extraction confidence, and the compact facts payload; write it after accepted English full generation and read it for localized full and short generation.
- Improve deterministic facts extraction in `canonical-facts.service.ts` with regex/heuristics for proper names, locations, motifs, rules, final reveal, final line, and forbidden inventions; for Episode 025 fixtures this must produce `Arin Caldor`, service/backrooms locations, fluorescent/wet-carpet/internal-phone motifs, red-door/rule details, final underground-level reveal, phone-extension final sting, and forbidden `Adrian`, `Adrian Cole`, `Funkgerät`.
- Update `compileShortStoryPrompt` and prompt modules so Shorts explicitly require a complete narrated micro-story, first impossible detail in sentence one, one central rule, one final sting, canonical names/devices/locations preserved, no structural commentary, and output limited to the renderer's requested script/schema.
- Set short budgets to English `150-170` words and German `155-180` words; keep other languages on existing duration-derived ranges unless language config already provides a stricter range.
- Change short defaults to `gpt-5.4-medium`, `low`, `1200` max output tokens, and set repair defaults to validator/mini settings; keep user-provided env/CLI values unchanged but surface warnings.
- Update config defaults in `packages/config/src/index.ts` and story constants: story `5500`, localization `5200`, short `1200`, validator `2500`, metadata `1200`, story reasoning `medium`, localization/short/validator/metadata reasoning `low`.
- Add config warning helpers used by CLI story commands: short cap `>2000`, localization model equals story model, story cap `>7000` for target below `2000` words, validator cap `>3000`; include warnings in JSON summaries and logs without mutating values.
- Add `story-quality-gate.ts` to map deterministic checks into `StoryQualityGateResult`: word range, duplicate metadata/provenance marker, language heading leakage, banned outline phrases, canonical name preservation, forbidden inventions, malformed localized fragments, final sting, abstraction, and token budget warnings.
- Keep semantic/model validation optional and injectable; tests must use fake validators only and no OpenAI network calls.
- Add deterministic repair utilities for metadata de-duplication, generated-marker replacement, malformed German service compounds, short script body name/device repairs, and paragraph-range final-sting repair.
- Change acceptance flow to `PASS` write, `REPAIRABLE` one deterministic fix or one cheap targeted repair, `FAIL` no artifact write; failed runs persist a failure report/manifest entry and preserve any previous accepted artifact.
- Restrict short repair flow so ordinary quality failures do not fall through to full regeneration; allow regeneration only for existing token-exhaustion retry behavior.
- Fix renderer/source-cleaner idempotency so exactly one metadata block and one `mediaforge:generated-full-story` marker are written, and reruns replace generated sections instead of appending fallback compatibility metadata.
- Improve generation reports/sidecars to include artifact kind, language, model, reasoning effort, max output tokens, input mode `full-source` or `facts+excerpts`, approximate input/output size, quality gate status, repair count, deterministic fixes, rejected reasons, and output path.
- Update `docs/development/configuration.md`, `docs/multilingual-story-localization-settings.md`, and the CLI docs section listing story env vars with cost-safe defaults and warning behavior.
- Create `docs/reports/codex-runs/2026-07-08-rewrite-cost-quality.md` after implementation; this task is not based on a file under `docs/plans/*`, so no `docs/reports/<date>/<plan>-implementation-report.md` is required unless implementation later follows a plan file.

## Tests And Fixtures

- Add Episode 025-style fixtures under `packages/story-localization/src/__fixtures__/story-quality/`: good English full, bad English outline short with `Adrian Cole`, bad German short with `Funkgerät`, malformed German full with `Servic Eingang`/`Servic eflur`, and duplicate generated metadata.
- Add unit tests for canonical facts extraction and `story-facts.json` persistence/read fallback.
- Add unit tests for short prompt text asserting narrative-script instructions, banned outline phrase prohibitions, facts+excerpts input mode, and compact facts use.
- Add unit tests for quality gates asserting bad Shorts reject or become targeted-repairable, canonical names preserved, forbidden inventions detected, malformed German terms detected, duplicate metadata fixed deterministically, final sting required, and token warnings emitted.
- Add config tests for new defaults and warning-only behavior with user overrides.
- Add service tests with fake clients proving no paid provider calls in tests, exactly one targeted repair call when repairable, no full regeneration for repairable quality failures, and previous accepted artifacts are preserved on `FAIL`.
- Add reporting tests asserting quality gate status and cost-relevant settings appear in summaries/sidecars.

## Verification

- Run focused tests first: `pnpm test:focused -- packages/story-localization/src/generated-story-validator.unit.test.ts`, plus new focused test files for contracts/facts/quality gates/short prompt.
- Run affected CLI/config tests: `pnpm test:focused -- packages/config/src/index.unit.test.ts`, `pnpm test:focused -- apps/cli/src/story-short-rewrite-command.unit.test.ts`, and relevant full/localization command tests if CLI warning output changes.
- Run typechecks after focused tests pass: `pnpm --filter @mediaforge/story-localization typecheck`, `pnpm --filter @mediaforge/config typecheck`, and `pnpm --filter @mediaforge/cli typecheck`.
- Run lint narrowly with `pnpm lint:affected` if changed-file detection covers the touched files; otherwise run ESLint only for changed source paths via `node scripts/run-eslint.mjs --changed`.
- Do not run paid provider commands; any `stories rewrite-short` verification must use dry-run/fake provider paths only.

## Assumptions

- Recommended model names such as `gpt-5.4-medium` are acceptable as defaults in this repo; user-provided env values remain authoritative.
- `story-facts.json` becomes the stable compact contract, while the existing source-hash facts cache remains a compatibility/cache layer.
- Existing legacy CLI compatibility stays intact unless a focused regression test proves a compatibility output is unsafe.
- Fixture updates are limited to intentional new contracts; no broad snapshot or generated fixture regeneration is allowed.
