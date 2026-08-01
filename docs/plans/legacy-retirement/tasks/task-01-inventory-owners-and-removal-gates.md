# Task 01: Inventory Owners And Removal Gates

## Objective

Create the authoritative retirement register before changing behavior.

## Scope

Inventory active legacy modes, path candidates, compatibility writes, command
aliases, workflow authorities, migration readers, response adapters, and
publishing entry points across `apps/cli` and affected packages.

## Procedure

1. Start from the remaining-match classification in the prior Task 20 report.
2. Trace every production caller and classify the surface as active rollback,
   read-only import, write compatibility, command alias, migration tool,
   historical schema, or dead code.
3. Record owner, canonical replacement, data population, observation method,
   support-window end condition, rollback action, and removal gate.
4. Add telemetry or structured diagnostics only where existing evidence cannot
   establish whether a surface is used.
5. Obtain explicit operator acceptance for removal gates that cannot be proven
   from repository-local evidence.

## Deliverables

- A versioned retirement register under `docs/migrations/`.
- A machine-readable inventory if automation will enforce the gates.
- Named owners and smallest follow-up task for every unresolved surface.

## Validation

- Targeted source searches have no unclassified production matches.
- Every removal gate names observable evidence and a rollback action.
- The inventory distinguishes read compatibility from writable authority.

## Completion gate

No implementation task begins without a register entry for the surface it
changes. Unknown usage is a blocker, not evidence of disuse.
