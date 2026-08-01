# Task 13: Final Verification And Reporting

## Objective

Reconcile all task branches, record exact evidence, and decide whether the mocked implementation is accepted without crossing external evidence gates.

## Dependencies And Parallelism

Depends on Tasks 11 and 12. Lead-agent task; not parallelizable.

## Exclusive Ownership

- `docs/reports/<YYYY-MM-DD>/strategic-reinvention-implementation-plan-implementation-report.md`
- final Codex run report
- task completion status in planning docs if necessary

Production fixes belong to the owning task, not this task.

## Work

1. Confirm all expected commits and no unintended generated or episode artifacts.
2. Review dependency direction and creator-specific leakage.
3. Run the focused acceptance fixture and the smallest affected package checks within current verification authorization.
4. Classify every failure; do not weaken assertions or broadly regenerate fixtures.
5. Record completed, partial, omitted, deviated, risky, and blocked work.
6. Confirm all live publication/voice/likeness/CTA capability gates remain closed without evidence.

## Minimum Verification

```bash
pnpm test:focused -- packages/strategic-reinvention/src/pilot.integration.test.ts
git diff --check
git status --short
```

Broad test/build/lint/typecheck requires explicit human authorization and is not implied by this task.

## Acceptance

The implementation report satisfies `AGENTS.md`, lists exact commands/results, and makes no unsupported success claim. The final worktree is reviewable by coherent checkpoint and contains no secrets.

Lead checkpoint: `chore(strategy): record strategic implementation evidence`.
