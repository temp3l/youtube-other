# Post-Refactor Stability Audit

Date: 2026-07-03

## Executive Verdict

NOT READY

The repository is improved after legacy pipeline removal, but production readiness is not proven. Canonical 022 authored-script resolution passes for English/German and full/short dry-run cells. The visual-retention smoke cells are blocked by missing shot-plan artifacts, and one focused story-localization unit test fails. No paid provider calls were executed.

## Baseline

- Branch: `plan/remove-legacy-and-normalize-paths`
- Commit: `a1ad1c8c38d60f28b7fc8bc6ee4b86dfa0172420`
- Node: `v22.13.0`
- pnpm: `10.16.0`
- Workspace packages: `apps/api`, `apps/cli`, `apps/web`, `packages/alignment`, `packages/config`, `packages/dark-truth`, `packages/domain`, `packages/image-generation`, `packages/metadata`, `packages/observability`, `packages/persistence`, `packages/process-runner`, `packages/rendering`, `packages/rewriting`, `packages/scene-planning`, `packages/shared`, `packages/source-ingestion`, `packages/speech`, `packages/story-localization`, `packages/testing`, `packages/transcript-cleaning`, `packages/transcription`, `packages/visual-planning`, `packages/youtube-upload`.
- Recent refactor packages observed from code and history: `apps/api`, `apps/cli`, `packages/shared`, `packages/story-localization`, `packages/speech`, `packages/image-generation`, `packages/rendering`, `packages/metadata`, `packages/visual-planning`, `packages/persistence`, docs.
- Pre-existing untracked files: `content-ideas/...`, `docs/cli-audio.md`, `docs/cli-video.md`, `todo-prompts/...`.

## System Boundary Matrix

| Boundary | Owner | Input | Output | Tests/evidence | Status |
|---|---|---|---|---|---|
| CLI | `apps/cli` | commands/options | use-case calls and artifacts | `apps/cli/src/index.unit.test.ts`; CLI dry-runs | Partial |
| API health | `apps/api` | HTTP request | `{ ok, workspace }` | `@mediaforge/api typecheck`; no `createPipeline` import | Pass |
| Canonical resolver | `packages/shared` | workspace, episode, language, variant | absolute path, repo path, hash, cache identity | `episode-filesystem.unit.test.ts`; 022 matrix | Pass with identity gap |
| Story rewrite/localization | `packages/story-localization` | source markdown, model config | full/short artifacts, cache | focused test fails | Blocked |
| Visual implementation / shots | `packages/visual-planning`, `apps/cli/src/shots.ts` | source scenes, scene plan, images | shot plan, validation | all 022 shot validation cells fail missing artifact | Blocked |
| Scene plan | `packages/domain`, `apps/cli` | narration/script | scenes | existing 022 files only, not regenerated | Unproven |
| Image setup | `packages/image-generation` | scene plan/prompts | image manifests | existing 022 manifests only | Unproven |
| Narration setup | `packages/speech`, `apps/cli` | script/segments | staged manifests/audio | type surface inspected only | Unproven |
| Rendering | `packages/rendering` | scene/images/audio | render manifest/video | not run to avoid generation | Unproven |
| Metadata | `packages/metadata` | scene plan/narration | YouTube metadata | not run to avoid provider calls | Unproven |
| Upload prep | `packages/youtube-upload` | metadata/video | upload request | not run | Unproven |

## Validation Matrix

| Cell | Command | Exit | Hash / count | Status |
|---|---|---:|---|---|
| Script en/full | `node apps/cli/bin/mediaforge.js episode dry-run --episode 022-the-whistler-in-the-woods --language en --artifact full --json` | 0 | hash `ac531f...537ad`; scenes estimate 75 | Pass |
| Script de/full | same with `--language de --artifact full` | 0 | hash `cb169...facf`; scenes estimate 75 | Pass |
| Script en/short | same with `--language en --artifact short` | 0 | hash `72c60...ec15`; scenes estimate 8 | Pass |
| Script de/short | same with `--language de --artifact short` | 0 | hash `94a16...e757`; scenes estimate 8 | Pass |
| Validate en/full | `episode validate ... en full` | 0 | reports `dryRun: true` | Partial |
| Validate de/full | `episode validate ... de full` | 0 | reports `dryRun: true` | Partial |
| Validate en/short | `episode validate ... en short` | 0 | reports `dryRun: true` | Partial |
| Validate de/short | `episode validate ... de short` | 0 | reports `dryRun: true` | Partial |
| Shots en/full | `shots validate --episode 022-the-whistler-in-the-woods --locale en --variant full --format json` | 1 | missing `shot-plan.full.en.json` | Blocked |
| Shots de/full | same with `de/full` | 1 | missing `shot-plan.full.de.json` | Blocked |
| Shots en/short | same with `en/short` | 1 | missing `shot-plan.short.en.json` | Blocked |
| Shots de/short | same with `de/short` | 1 | missing `shot-plan.short.de.json` | Blocked |

## Findings And Implementation Plans

### F1: Missing visual-retention shot-plan artifacts

- Severity: blocker
- Affected packages: `apps/cli`, `packages/visual-planning`, `packages/shared`
- Violated invariant: full/short multilingual visual validation must validate actual artifacts.
- Reproduction: the four `shots validate` commands above.
- Root cause: episode 022 has generated scene/image manifests, but no `state/visual-retention/shot-plan.<variant>.<locale>.json` artifacts.
- Fix status: not fixed.
- Plan: add a zero-cost `shots plan --dry-run` or fixture-backed `shots plan` test for 022-like inputs; decide whether repository-owned episodes must commit shot plans; generate/import missing shot plans only after that decision; rerun the four shot validation cells.
- Residual risk: visual-retention renderer integration remains unproven.

### F2: Story-localization focused test failure

- Severity: high
- Affected packages: `packages/story-localization`
- Violated invariant: tests must pin full-vs-short validation routing.
- Reproduction: `pnpm test:focused -- packages/story-localization/src/story-localization.unit.test.ts`
- Exact failure: `rejects localized full outputs that would require short-specific repair` expected `Short word count`, received `Character names are missing.`
- Root cause: current validator failure ordering or fixture content masks the short-specific failure the test intends to prove.
- Fix status: not fixed.
- Plan: inspect `makeLocalizedPackage` fixture and validator order; preserve the behavioral invariant without weakening assertions; add a narrower assertion proving no short repair prompt is used for localized full; rerun the focused test.
- Residual risk: localized full/short repair routing could regress unnoticed.

### F3: Resolver cache identity omits canonical relative script path

- Severity: medium
- Affected packages: `packages/shared`, downstream cache consumers
- Violated invariant: identity should include episode, language, variant, canonical relative script path, content hash, resolver/schema version.
- Reproduction: `resolveAuthoredScript` builds `authored-script-resolver-v1:<episode>:<language>:<variant>:<hash>` without `relativePath`.
- Root cause: path is returned separately but not included in `cacheIdentity`.
- Fix status: not fixed.
- Plan: update resolver cache identity to include `relativePath`; update tests to assert path/source invalidation; audit downstream cache keys that only use `sourceHash`; treat old identities as stale.
- Residual risk: future resolver path changes may reuse old cache entries if content is identical.

### F4: Downstream resolver metadata is collapsed to file path

- Severity: medium
- Affected packages: `apps/cli`, `packages/story-localization`, `packages/speech`, `packages/metadata`
- Violated invariant: resolver version and content hash should be available downstream.
- Reproduction: `resolveEpisodeLanguageSource` returns only `{ sourceFile }`.
- Root cause: CLI adapts the resolver into a legacy file-path contract.
- Fix status: not fixed.
- Plan: introduce a typed `ResolvedEpisodeLanguageSource` carrying `relativePath`, `contentHash`, `cacheIdentity`, `resolverVersion`, and log context; thread it into review packages, narration dependencies, metadata dependencies, and cache keys.
- Residual risk: observability and cache invalidation remain incomplete.

### F5: `episode validate` duplicates dry-run semantics

- Severity: medium
- Affected packages: `apps/cli`
- Violated invariant: validation-only commands should be distinct from dry-run planning.
- Reproduction: four `episode validate` commands exit 0 and emit `dryRun: true`.
- Root cause: command appears to delegate to dry-run behavior.
- Fix status: not fixed.
- Plan: split validate into read-only artifact validation with explicit checks for required manifests, schema versions, paths, hashes, warnings, and legacy fallback attempts; keep dry-run as planning only.
- Residual risk: green validation output can overstate readiness.

### F6: No cross-manifest referential-integrity validator found

- Severity: high
- Affected packages: `packages/shared` or new tooling package, `apps/cli`
- Violated invariant: end-to-end artifacts need one validator for scene IDs, narration linkage, image/render references, language/variant/hash consistency, versions, and output ownership.
- Reproduction: `rg` found shot-plan schema checks but no repository-wide referential validator.
- Root cause: validation is package-local.
- Fix status: not fixed.
- Plan: add a test/tooling validator that reads resolver result, rewrite manifest, scene plan, visual plan, image manifest, narration manifest, render manifest, metadata, and resume state; start with fixtures, then wire to `episode validate`.
- Residual risk: cross-package regressions are not caught by unit tests.

## Stale Reference Classification

| Pattern group | Classification | Evidence |
|---|---|---|
| `@mediaforge/pipeline`, `createPipeline` in `apps packages scripts` | removed from active code | `rg` returned no matches; `pnpm why @mediaforge/pipeline` returned no dependents |
| `legacy` narration rollout | active intentional | `packages/config`, `packages/speech`, `apps/cli` still default/accept `legacy|shadow|new` |
| legacy shot migration | migration-tool detection | `packages/visual-planning/src/legacy-shot-plan.ts`, shot CLI tests |
| stale authored script paths in tests | test fixture intentional | resolver and migration tests cover rejection |
| stale authored script paths in docs/plans/audits | historical documentation intentionally retained | remove-legacy plan docs and older audits |
| image legacy fallback paths | active transitional compatibility | shared/image-generation tests and adapters |
| story compatibility source/output | active transitional compatibility | short rewrite `--compatibility-source`, canonical full compatibility markdown |
| `pipeline_runs`, `step_runs` | rejection fixture | persistence integration test asserts tables are absent |
| TODO/FIXME/HACK | no blocking active match found in inspected output | remaining hits are fallback/compatibility terminology, not TODO debt |

## Changed Files

- Production code: none
- Tests: none
- Fixtures: none
- Tooling: none
- Docs: `docs/audits/post-refactor-stability/post-refactor-stability-audit.md`

## Validation Evidence

- `pnpm install --frozen-lockfile`: exit 0.
- `pnpm -r list --depth -1`: exit 0, 25 workspace projects.
- `pnpm why @mediaforge/pipeline`: exit 0, no dependents printed.
- `pnpm test:focused -- packages/shared/src/episode-filesystem.unit.test.ts`: exit 0, 17 tests passed.
- `pnpm test:focused -- apps/cli/src/index.unit.test.ts`: exit 0, 10 tests passed.
- `pnpm test:focused -- packages/story-localization/src/story-localization.unit.test.ts`: exit 1, one test failed as F2.
- `pnpm --filter @mediaforge/shared typecheck`: exit 0.
- `pnpm --filter @mediaforge/cli typecheck`: exit 0.
- `pnpm --filter @mediaforge/api typecheck`: exit 0.
- `pnpm --filter @mediaforge/story-localization typecheck`: exit 0.
- Four `episode dry-run` cells: exit 0.
- Four `episode validate` cells: exit 0 but reported `dryRun: true`.
- Four `shots validate` cells: exit 1 due missing shot-plan artifacts.

Broad repo-wide lint, test, and typecheck were not run because repository guardrails require focused validation unless broad verification is explicitly authorized and converging. This audit used focused commands and recorded unproven surfaces.

## Paid-Call Confirmation

No paid provider calls were executed. All commands were install, listing, static inspection, typecheck, focused tests, CLI help, dry-run, or validation commands. No image generation, speech generation, transcription, remote render, upload, or metadata generation was run.

## Controlled Real-Run Plan

Do not run these until F1 and F2 are resolved and a human approves paid execution. Use a clean branch, confirm `git status --short`, configure provider cost limits, and set an isolated output root such as `/tmp/mediaforge-prod-smoke-022`.

Zero-cost preflight:

```bash
node apps/cli/bin/mediaforge.js episode dry-run --episode 022-the-whistler-in-the-woods --language en --artifact full --output-root /tmp/mediaforge-prod-smoke-022 --json
node apps/cli/bin/mediaforge.js episode dry-run --episode 022-the-whistler-in-the-woods --language de --artifact full --output-root /tmp/mediaforge-prod-smoke-022 --json
node apps/cli/bin/mediaforge.js episode dry-run --episode 022-the-whistler-in-the-woods --language en --artifact short --output-root /tmp/mediaforge-prod-smoke-022 --json
node apps/cli/bin/mediaforge.js episode dry-run --episode 022-the-whistler-in-the-woods --language de --artifact short --output-root /tmp/mediaforge-prod-smoke-022 --json
```

Paid production smoke, no upload:

```bash
node apps/cli/bin/mediaforge.js stories rewrite-full --episode 022-the-whistler-in-the-woods --languages en,de --output-root /tmp/mediaforge-prod-smoke-022 --model <approved-low-cost-model> --reasoning-effort low --max-concurrency 1 --max-retries 1 --json
node apps/cli/bin/mediaforge.js stories rewrite-short --episode 022-the-whistler-in-the-woods --languages en,de --output-root /tmp/mediaforge-prod-smoke-022 --duration 60 --model <approved-low-cost-model> --reasoning-effort low --max-concurrency 1 --max-retries 1 --json
node apps/cli/bin/mediaforge.js episode english --episode 022-the-whistler-in-the-woods --output-root /tmp/mediaforge-prod-smoke-022 --no-visual-retention
node apps/cli/bin/mediaforge.js episode localized --episode 022-the-whistler-in-the-woods --languages de --output-root /tmp/mediaforge-prod-smoke-022 --reuse-images --no-visual-retention
node apps/cli/bin/mediaforge.js episode short --episode 022-the-whistler-in-the-woods --language en --output-root /tmp/mediaforge-prod-smoke-022 --reuse-images --no-visual-retention
node apps/cli/bin/mediaforge.js episode short --episode 022-the-whistler-in-the-woods --language de --output-root /tmp/mediaforge-prod-smoke-022 --reuse-images --no-visual-retention
```

Safeguards: do not run `youtube upload`; keep `/tmp/mediaforge-prod-smoke-022` isolated; capture costs; archive manifests before cleanup; cleanup with `rm -rf /tmp/mediaforge-prod-smoke-022` only after manual approval.

## Merge Recommendation

Remain blocked. Merge only after the story-localization test failure is resolved, visual-retention artifacts or validations are made reproducible, resolver identity includes path/source identity, and cross-manifest referential validation exists or is explicitly deferred with owner approval.
