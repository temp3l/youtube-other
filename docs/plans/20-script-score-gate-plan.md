# Script Score Gate Before Media Generation

## Summary

Add a hard production gate that rates each rewritten script on a `1-100` scale and blocks audio/image generation when the current script score is below `80`.

Use the existing story production analysis subsystem as the foundation. It already produces structured category scores, deterministic `overallScore`, verdicts, persisted analysis artifacts, and production-gate checks. This plan extends that path to short scripts, raises the hard score threshold to `80`, and ensures media generation cannot bypass the gate.

Recommended evaluator model:

- Default: `gpt-5.6-terra` with low reasoning for production scoring.
- Escalation/manual recheck: `gpt-5.6-sol` with medium reasoning.
- Avoid `gpt-5.6-luna` for this gate unless cost becomes the dominant constraint; use it only after calibration confirms it matches Terra decisions closely enough.

Rationale: use the Responses API with structured outputs because the current analyzer already uses Zod structured parsing and deterministic application-side gating. Keep model scores advisory and the deterministic weighted `overallScore` authoritative.

## Implementation Changes

- In `packages/story-localization/src/story-production-analysis.ts`, introduce `SCRIPT_PRODUCTION_MIN_SCORE = 80`, update the `overall-score` production gate from `>= 75` to `>= 80`, and bump `STORY_PRODUCTION_ANALYSIS_GATE_VERSION` so older cached analyses become stale.
- Extend analysis support from `full` only to `full | short`. Persist artifacts beside the reviewed script at `<episode>/<language>/<format>/story-production-analysis.json`, and make fingerprinting include `format`.
- Resolve short script inputs through existing episode path helpers instead of ad hoc paths. For short scripts, use the current full-script lineage as the parent reference when available; otherwise fail analysis as stale/missing lineage.
- Extend `QualityGateDecision`, production status entries, and inspect/status JSON with optional `overallScore`, `minimumScore`, and `analysisState`.
- Update fallback workflow status reconstruction so `quality-full` and `quality-short` are treated as completed only when a current passing analysis artifact exists. Script file existence alone must not complete quality stages.
- Add a shared media preflight helper, for example `assertScriptScoreGate({ outputRoot, episode, locale, format })`, that blocks when analysis is missing, stale, failed, or below `80`.
- Call that helper from all audio and image execution paths, including high-level wrappers and lower-level generation/resume commands that can be invoked directly.
- Keep the score gate non-overridable in v1. `--force` may regenerate media after a passing score, but it must not bypass a missing/stale/failed score.

## CLI Behavior

- `pnpm mediaforge stories analyze --episode <id> --language <code> --format full --json`
- `pnpm mediaforge stories analyze --episode <id> --language <code> --format short --json`

Expected behavior:

- Score `80-100` with no blocking findings: downstream audio/images may run.
- Score `1-79`: audio/images are blocked with a message such as `Script score 79/100 is below required minimum 80`.
- Missing or stale analysis: audio/images are blocked with a message telling the operator to run `stories analyze` for that episode/language/format.
- Mixed model output is not authoritative: if the model-proposed score differs from deterministic weighted score, use deterministic `overallScore`.

Status surfaces should expose `overallScore`, `minimumScore`, `pass`, `verdict`, `analysisCurrent`, and failed gate IDs wherever story production analysis status is already reported.

## Test Plan

- Unit-test production gate scoring: deterministic score `79` fails and `80` passes when all other checks pass.
- Unit-test cache invalidation: artifacts using the old gate version are stale.
- Unit-test short analysis source resolution and persistence for `<language>/short/script.md`.
- Unit-test status reconstruction: quality stages are not completed from script files alone; they require current passing analysis.
- Unit-test downstream blocking: audio/image stages become blocked when upstream quality analysis is missing, stale, or below `80`.
- CLI tests:
  - `stories analyze --format short --json` emits a valid artifact.
  - `stories audio generate` skips/blocks a target with score `79`.
  - `stories images generate` blocks a direct episode target with score `79`, even without `--only-ready`.
  - both wrappers proceed with score `80`.

Suggested focused verification:

```bash
pnpm test:focused -- packages/story-localization/src/story-production-analysis.unit.test.ts
pnpm test:focused -- packages/story-localization/src/story-workflow-status.unit.test.ts
pnpm test:focused -- apps/cli/src/story-audio-command.unit.test.ts apps/cli/src/story-images-command.unit.test.ts
pnpm --filter @mediaforge/story-localization typecheck
pnpm --filter @mediaforge/cli typecheck
```

## How To Run After Implementation

Analyze a full script:

```bash
pnpm mediaforge stories analyze --episode 033 --language en --format full --json
```

Analyze a short script:

```bash
pnpm mediaforge stories analyze --episode 033 --language en --format short --json
```

Check production readiness:

```bash
pnpm mediaforge stories production status --episode 033 --json
```

Generate media only after passing score gates:

```bash
pnpm mediaforge stories audio generate --episode 033 --only-ready --json
pnpm mediaforge stories images generate --episode 033 --only-ready --json
```

When a script is blocked, rewrite or repair it, rerun `stories analyze`, then rerun the media command.

## Assumptions

- The gate applies to both full and short rewritten scripts.
- Threshold is fixed at `80` in v1.
- No automatic repair is included.
- Existing locale set remains `en,de,es,fr,pt`; legacy `sp` remains invalid.
- Do not modify generated media assets as part of this implementation.
- When implementing this plan, create `docs/reports/<YYYY-MM-DD>/20-script-score-gate-plan-implementation-report.md` because work will be based on a file under `docs/plans/`.
