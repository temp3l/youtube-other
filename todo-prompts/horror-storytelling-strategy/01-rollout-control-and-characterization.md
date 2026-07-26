# Task 01 — Rollout Control And Characterization

Implement only this task. Reuse the existing Dark Truth story pipeline and follow
the rules in this folder's `README.md`.

## Goal

Make the existing affect-plan integration safely reversible with
`off | shadow | enforce`, defaulting to `shadow`, while pinning today's behavior
with characterization tests.

## Context

Canonical-English eligible fiction currently gets `HorrorAffectPlan`
instructions automatically, and its plan hash affects the prompt fingerprint.
The source plan intended a shadow-first rollout. This task must correct that
without deleting the existing implementation.

## Inspect First

- `packages/story-localization/src/horror-affect-plan.ts`
- `packages/story-localization/src/story-prompt-compiler.ts`
- `packages/story-localization/src/story-prompt-modules.ts`
- `packages/story-localization/src/story-prompt-module-registry.ts`
- `packages/story-localization/src/story-prompt-compiler.unit.test.ts`
- `packages/story-localization/src/story-localization.types.ts`
- `packages/story-localization/src/story-localization.service.ts`
- `packages/story-localization/src/story-localization-batch-service.ts`
- `packages/config/src/index.ts`
- `apps/cli/src/story-full-rewrite-command.ts`
- `apps/cli/src/story-localization-commands.ts`

## Required Work

1. Add a typed rollout setting with exactly `off`, `shadow`, and `enforce`.
   Follow existing config/env conventions; default to `shadow`.
2. Characterize the currently enforced canonical-English prompt and fingerprint
   before changing defaults.
3. Define mode semantics:
   - `off`: do not build, emit, or fingerprint an affect plan.
   - `shadow`: build and validate the deterministic plan and expose diagnostics,
     but do not change provider request text or accepted narration cache identity.
   - `enforce`: preserve today's affect-plan prompt behavior and include its
     versions/hash in the compiler fingerprint.
4. Thread the setting through synchronous and batch canonical-English paths.
   Localized full and Short behavior must remain unchanged.
5. Ensure unsupported, non-fiction, or ineligible inputs behave as they do now.
6. Add structured mode/eligibility/plan diagnostics without logging story text.
7. Update configuration and story-localization behavior docs only where needed.

## Focused Verification

- Extend the prompt-compiler unit test for all three modes, default shadow,
  eligible/ineligible stories, request equality in shadow versus off, and
  fingerprint behavior.
- Add the narrowest config or CLI unit test needed to prove setting plumbing.
- Run at most the directly affected test files, then one story-localization
  package typecheck after they pass.

## Acceptance Criteria

- Default execution is shadow and changes no provider request.
- `enforce` reproduces the characterized current prompt and cache behavior.
- Shadow/off do not invalidate already accepted narration.
- Sync and batch callers agree on mode semantics.
- No provider call, generated asset mutation, or unrelated refactor occurs.
- Rollback is a configuration change.
