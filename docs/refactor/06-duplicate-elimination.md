# Duplicate Elimination

## Definition

Harmful duplication is independently maintained business logic, path policy,
prompt selection, provider invocation, validation, cache/state logic, or
orchestration for the same logical production task. A wrapper that only
normalizes inputs, delegates to the canonical task, and translates documented
output is an acceptable compatibility adapter.

Intentional strategies are not duplicates when selected through one canonical
task contract. Examples include synchronous versus provider-batch execution and
local versus remote rendering.

## Initial High-Risk Families

The existing media inventory identifies these starting risks, which the full
audit must verify against current source:

- audio orchestration in CLI, speech, and Dark Truth flows;
- image orchestration across synchronous, batch, OpenAI, workbook/import,
  Shorts, thumbnail, and Dark Truth paths;
- render request construction in CLI and Dark Truth flows;
- AI-backed and heuristic metadata contracts;
- story/full/Short workflow manifests and batch state;
- Dark Truth approvals versus mathematics quality approvals;
- episode and math workspace path resolvers;
- subsystem-specific fingerprint, retry, resume, and observability records;
- scripts or Codex prompts that invoke providers or infer paths directly.

These are audit leads, not automatic deletion targets.

## Canonical Selection Rules

Select an existing implementation when it has the strongest active callers,
validation, manifest lineage, idempotency, tests, and compatibility. Create a
new facade when no implementation owns the complete application contract. Do
not copy internals into the facade; adapt the strongest service and migrate
missing behavior deliberately.

Provider adapters remain behind capability ports. Path, retry, cache, state,
approval, and validation decisions belong to engine/task policy, not provider
classes.

## Family Migration Order

1. domain/configuration and artifact resolution;
2. story generation, full rewrite, localization, and Shorts;
3. story/lesson quality gates and approvals;
4. references, scene planning, images, and thumbnails;
5. narration, audio validation, captions, and timing;
6. deterministic education visuals and shared render orchestration;
7. metadata and publish dry-run;
8. batch, repair, migration, and Codex/npm wrappers;
9. irreversible publishing last.

Within each family:

1. identify every caller and entry point;
2. characterize paths, schemas, output, logs, retries, cache, exit codes, and
   side effects;
3. classify differences as defect, intentional strategy, compatibility, or
   unresolved product decision;
4. select one canonical task/application service;
5. add characterization tests before behavior changes;
6. implement a thin compatibility adapter;
7. migrate direct CLI, workflow, batch, repair, script, test, and Codex callers;
8. verify canonical and compatibility behavior;
9. search for remaining imports, invocations, writers, and path literals;
10. remove obsolete logic only after the removal gate passes.

## Required Verification Searches

Maintain targeted searches for:

- direct provider constructors and API endpoint calls outside adapters;
- `path.join`/`path.resolve` in production artifact producers;
- direct `writeFile`, `rename`, `copyFile`, and stream outputs outside artifact
  repositories or approved low-level utilities;
- prompt file reads outside the prompt registry;
- task success based only on `exists`/`stat`;
- alternate state, approval, override, cache, or batch manifest writers;
- legacy command strings in npm scripts, shell scripts, docs, prompts, and tests;
- imports of removed symbols and packages.

Search findings require review; path construction for temporary files, source
inputs, or non-production diagnostics is not automatically a violation.

## Removal Record

For every removed implementation record:

```text
logical task
removed symbols and paths
former callers
canonical replacement
compatibility adapter retained
characterization and regression tests
searches performed
artifact/path/schema/log/exit compatibility result
rollback method
removal date and batch
```

Retained adapters record the exact removal condition. Experimental or supported
strategies record why they are not duplicate application implementations.

## Completion Gate

Duplicate elimination is complete only when every production capability has one
registered application task, all active callers reach it, production writers
are resolver-owned, hidden-caller searches are clean or explained, legacy
commands delegate or fail with migration guidance, and repository-wide
deterministic validation passes except explicitly accepted unchanged failures.

