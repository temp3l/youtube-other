# Task 12: Operator Documentation And Migration

## Objective

Document the implemented architecture and safe operator workflow without overstating creator rights or YouTube capability.

## Dependencies And Parallelism

Depends on Tasks 09 and 10. Safe in parallel with Task 11.

## Exclusive Ownership

- `AGENTS.md` documentation-routing additions only
- relevant files under `docs/architecture/`
- new Strategic Reinvention source/creator onboarding, approval, localization, audio, migration, dry-run, and limitations docs
- source documents under `docs/refactor/` when architecture authority changes
- docs index links

Do not hand-edit generated AI-context files; use the documented generator only at the final lead gate.

## Required Content

- architecture and package ownership;
- configuration and merge semantics;
- source and creator onboarding;
- approval/revocation/invalidation runbook;
- Italian localization and protected terms;
- multilingual audio capability outcomes;
- read-compatible/write-forward migration;
- mocked operator dry run;
- explicit unsupported capabilities and external evidence requirements.

## Verification

```bash
git diff --check -- AGENTS.md docs
pnpm ai-pack:validate
```

Run `ai-pack:build` only if validation proves generated context is stale and the lead authorizes updating the generated outputs.

## Acceptance

Commands and paths match source; no document claims permission, live alternate-audio support, synthetic creator media, or auto-publication.

Lead checkpoint: `docs: add strategic reinvention operator guidance`.
