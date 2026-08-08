# Task 14: Publication Mutation

## Objective

Implement private-first YouTube publication only after resumable recovery semantics,
fresh authority checks, and channel serialization are proven.

## Depends On

Task 13 plus explicit publication authorization, controlled credentials, and
accepted YouTube recovery evidence.

## Scope

- Add the internal publication-intent command and narrowly entitled API/UI action.
- Recheck current artifact hashes, approval, credential handle/version, channel,
  policy, quota, and lease immediately before mutation.
- Persist intent/effect checkpoints and resumable-session/recovery markers around
  every YouTube boundary, including thumbnail/playlist follow-up effects.
- Serialize per channel and route ambiguity to `reconciliation_required`.
- Fault-inject before/after each provider acceptance and local commit boundary.

## Out Of Scope

Public-by-default visibility, blind force/retry, broad scheduling features, multiple
channels per tenant without evidence, and automatic reconciliation guesses.

## Acceptance

- Each fault case yields exactly one private video or `reconciliation_required`.
- Revoked/stale approval or credentials prevent mutation even after job admission.
- Late lease holders cannot commit and duplicate requests reuse one intent.
- Controlled smoke has explicit effect/cost approval and durable provider receipts.

## Reports

Create the plan implementation report and Codex run report required by the pack README.
