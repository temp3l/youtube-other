# VRI-20 — Review events, webhooks, and tenant isolation

## Objective

Add reviewer actions and lifecycle events through existing authorization, outbox, webhook, and tenant boundaries.

## Priority

P0

## Stories covered

VER-123 (PARTIAL), VER-124 (PARTIAL), VER-125 (COMPLETE)

## Existing implementation/evidence

Reusable foundations are recorded in the gap analysis; this task binds or completes them without duplication.

## Required changes

- Extend shared capability → policy/configuration → Veronica adapter; do not create a parallel subsystem.
- Persist revision-bound, versioned artifacts with provenance, effective configuration, and dependency identity.
- Preserve valid approved/cache-compatible artifacts; fail closed before paid or irreversible work.

## Explicit non-goals

- No production-provider dispatch, live publication, or source-original mutation.
- No Veronica-specific cache, workflow, approval, renderer, or publisher copy.
- No unrelated legacy cleanup.

## Likely files/modules

apps/api/src/contract.ts; packages/application/src/webhooks.ts; packages/persistence/src/postgres-workflow-repository.ts

## Data/schema impact

Strict versioned contracts only. Normalize the alias to `veronicabenini` before persisted identity/fingerprint construction.

## API/contract impact

Add only stable typed interfaces. API and CLI call the same workflow/capability service; retriable mutation requires authorization and idempotency.

## Dependencies

VRI-12,VRI-19

## Parallel-safety classification

**SERIAL**.

## Shared-file ownership

**EXCLUSIVE_WRITE_OWNER:** apps/api/src/contract.ts after VRI-19. Other tasks must use additive/disjoint files or wait for this owner.

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
