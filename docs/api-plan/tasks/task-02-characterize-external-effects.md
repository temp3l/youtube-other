# Task 02: Characterize External Effects

## Objective

Prove current crash and timeout windows for every paid or irreversible provider interaction.

## Scope

- inject failure before submission, after provider acceptance, before provider-ID persistence, and after local timeout
- cover YouTube upload, thumbnail, playlist, AI, TTS, image, render registration, and provider batches
- classify operations as safe retry, reconcile before retry, or never auto-retry
- perform a provider-documentation/protocol proof for YouTube resumable sessions and recovery markers

## Out Of Scope

Live mutation calls and implementation of the target effect journal.

## Tests And Verification

Use deterministic fake providers in focused tests under the owning packages. Run each affected test with `pnpm test:focused -- <changed-test-file>`.

## Acceptance Criteria

Each effect has a documented acceptance boundary, observable recovery identity, and retry classification. YouTube publishing remains blocked if exact recovery cannot be proven.
