# Task 01: Baseline And Contract Gap

## Objective

Freeze an evidence-backed baseline of what the API, SDK, workers, CLI, and web
actually support, then identify only the gaps required by the selected SaaS journey.

## Scope

- Characterize current API operations and their SDK coverage.
- Map the customer journey to commands, queries, permissions, jobs, assets,
  validations, approval challenges, events, and operator recovery actions.
- Confirm missing list/discovery/read-model operations rather than inferring them.
- Add provider-free characterization tests only where behavior is currently
  unprotected, including one typed episode-to-job fixture per candidate profile.
- Classify each gap as contract, composition, UI, infrastructure, operations, or gate.

## Out Of Scope

New routes, UI, database schema changes, production providers, and fixture regeneration.

## Acceptance

- Every planned screen/action maps to an existing operation or named gap.
- Current supported and unsupported capability matrix cells are explicit.
- Focused API/SDK/worker characterization tests pass.
- The gap register names owning modules and the smallest implementing task.

## Likely Files

`apps/api/src/contract.ts`, `apps/api/src/http-server.ts`,
`packages/api-sdk/src/index.ts`, focused tests, and planning evidence only.

## Reports

Create the plan implementation report and Codex run report required by the pack README.
