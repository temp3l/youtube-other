# Task 06: Cut Over Remaining Callers And Authorities

## Objective

Ensure remaining CLI, package-bin, math, and workflow compatibility callers
delegate to one canonical implementation and writable authority.

## Scope

Legacy math simulation, production caller adapters, story workflow aliases,
package entry points, filesystem-owned workflow state, and database-v1 routing.

## Procedure

1. Classify each caller from Task 01 as supported alias, migration-only tool, or
   removal candidate.
2. Characterize arguments, outputs, exit codes, resume semantics, and state
   ownership before delegation.
3. Route supported aliases through the canonical task registry without allowing
   the alias to own provider calls, paths, cache, validation, or policy.
4. Assign each new workflow instance exactly one writable authority; projections
   for legacy readers remain read-only.
5. Migrate or finish existing filesystem-owned instances rather than switching
   authority mid-run.
6. Deprecate aliases with replacement guidance and a declared support window.

## Validation

- Focused caller-migration and command tests prove delegation and preserved CLI
  contracts.
- State tests prove no dual writes and safe resume under the selected authority.
- Migration-only commands remain explicit and non-production by default.

## Completion gate

All active callers delegate to registered canonical tasks, and no workflow
instance has competing writable authorities.
