# VRI-11 — Voice policy, TTS, timing, and captions

## Objective

Use shared speech policy and supplied-human media; preserve visuals for voice-only changes.

## Priority

P0

## Stories covered

VER-060 (PARTIAL), VER-062 (PARTIAL), VER-063 (PARTIAL)

## Existing implementation/evidence

The speech platform is provider-neutral; creator policy deliberately blocks synthetic Veronica narration.

## Required changes

- Extend shared capability → policy/configuration → Veronica adapter; do not create a parallel subsystem.
- Persist revision-bound, versioned artifacts with provenance, effective configuration, and dependency identity.
- Preserve valid approved/cache-compatible artifacts; fail closed before paid or irreversible work.

## Explicit non-goals

- No production-provider dispatch, live publication, or source-original mutation.
- No Veronica-specific cache, workflow, approval, renderer, or publisher copy.
- No unrelated legacy cleanup.

## Likely files/modules

packages/speech/src/creator-voice-policy.ts; packages/speech/src/platform; packages/story-localization/src/strategic-italian-media-persistence.ts

## Data/schema impact

Strict versioned contracts only. Normalize the alias to `veronicabenini` before persisted identity/fingerprint construction.

## API/contract impact

Add only stable typed interfaces. API and CLI call the same workflow/capability service; retriable mutation requires authorization and idempotency.

## Dependencies

VRI-05,VRI-04

## Parallel-safety classification

**SAFE_PARALLEL**.

## Shared-file ownership

**EXCLUSIVE_WRITE_OWNER:** speech creator-dispatch policy. Other tasks must use additive/disjoint files or wait for this owner.

## Acceptance criteria

- Satisfy the referenced source-story acceptance criteria through the canonical path.
- Record lineage, revision/configuration identity, and reuse/regeneration rationale.
- Do not invalidate language-independent visuals solely for localization.
- Preserve immutable approved history and actionable, redacted failure evidence.

## Affected-scope validation

- Focused unit tests beside the changed service/contract.
- `pnpm test:focused -- <affected-test-file>`.
- One bounded integration/contract/render-fixture test only when crossing a boundary; no repository-wide validation.

## Risks

Alias migration, legacy artifact ambiguity, and cross-owner schema edits can create competing authority; stop at the stated merge barrier.

## Completion evidence

Focused test result, artifact/contract fixture, and required Codex run report; document any unenabled external activation gate.
