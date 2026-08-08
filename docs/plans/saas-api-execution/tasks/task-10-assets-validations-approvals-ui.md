# Task 10: Assets, Validations, And Approvals UI

## Objective

Let authorized reviewers inspect immutable artifacts and validations, then record
or revoke revision/hash-bound approval decisions safely.

## Depends On

Tasks 07–09.

## Scope

- List and display entitled asset metadata through authorized download flows.
- Show validation severity, artifact/revision lineage, and actionable failures.
- Present approval challenges with exact scope, hashes, expiry, and required role.
- Record approve/reject decisions and revoke existing approvals with optimistic
  concurrency and an immutable actor/audit trail.
- Prevent UI caching of sensitive or expiring asset URLs.

## Out Of Scope

Browser filesystem access, editing generated binaries, bypassing failed validations,
automatic approval, and publication.

## Acceptance

- Stale revision/hash, expired challenge, revoked role, and cross-tenant tests fail closed.
- Approval cannot be applied to different artifacts, locale, variant, or workflow run.
- Accessible loading, empty, error, unavailable, and decision-complete states exist.
- Focused API/SDK/web tests and web typecheck pass.

## Reports

Create the plan implementation report and Codex run report required by the pack README.
