# Task 03: Registries And Strategic Profile Package

## Objective

Create runtime-validated generic registries and register the reusable genre and separate creator overlay.

## Dependencies And Parallelism

Depends on Tasks 01 and 02. Sequential merge-barrier task.

## Exclusive Ownership

- `packages/config/src/content-policy-registry.ts`, tests, and exports
- new `packages/strategic-reinvention/package.json` and `tsconfig.json`
- `packages/strategic-reinvention/config/*`
- `packages/strategic-reinvention/src/profile.ts`, tests, and initial `index.ts`
- workspace lockfile only if the approved YAML parser requires it

## Required Behavior

- Reject duplicate IDs, unknown schema versions, malformed policy, and creator/genre mismatch.
- Merge effective permissions by intersection in the decision-register order.
- Episode overrides narrow only; explicit grants are separate typed inputs.
- Parse the supplied YAML and JSON contracts without weakening them.
- Treat `veronica-benini.status=discovery` as a hard production block.

## Verification

```bash
pnpm test:focused -- packages/config/src/content-policy-registry.unit.test.ts
pnpm test:focused -- packages/strategic-reinvention/src/profile.unit.test.ts
pnpm --filter @mediaforge/strategic-reinvention typecheck
```

## Acceptance

Genre and creator remain independently addressable; safety/rights cannot be expanded by profile or episode input; generic packages contain no Veronica branches.

Lead checkpoint: `feat(profile): register strategic reinvention policy`.
