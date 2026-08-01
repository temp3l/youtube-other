# Task 08: Final Retirement Evidence

## Objective

Demonstrate that legacy retirement is complete without broad, uncontrolled
verification or paid-provider mutation.

## Scope

Retirement register, focused tests, package typechecks, packaged CLI checks,
migration evidence, representative existing episodes/lessons, documentation,
and release notes.

## Procedure

1. Re-run targeted source searches and classify every remaining `legacy` match
   as historical docs, import-only schema/data, explicit migration evidence, or
   false positive.
2. Run directly affected test files within the repository verification budget,
   followed by at most one affected-package typecheck where justified.
3. Run artifact migration in dry-run mode and resolve unexplained conflicts for
   the approved production population.
4. Exercise representative full/Short, locale, render-input, workflow-resume,
   and publish-dry-run paths without paid provider calls.
5. Confirm removed commands/configuration fail with actionable replacement
   guidance where a compatibility error is still promised.
6. Publish the implementation report and release/rollback notes.

## Validation result requirements

The final report must list exact commands, results, unverified paid or external
operations, remaining import-only compatibility, known risks, and the commit.
Broad repository tests, snapshot regeneration, production uploads, and provider
generation are not part of this gate without separate authorization.

## Completion gate

There are no unclassified active legacy callers or writes, canonical production
flows pass focused verification, migration evidence is clean for the approved
population, and operators have release and rollback guidance.
