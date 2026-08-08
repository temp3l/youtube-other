# Task 09: Project, Episode, And Workflow UI

## Objective

Implement the core pilot journey: discover/create a project, create/revise a typed
episode, start production, and observe/cancel/resume its durable workflow.

## Depends On

Tasks 02, 06, 07, and 08.

## Scope

- Build project and episode lists/details using SDK read models.
- Provide profile-specific, versioned episode forms for entitled matrix cells only.
- Preserve strong ETags and idempotency keys for replace/create/start actions.
- Render job/run/step status, structured failures, retryability, deadlines, and
  cancel/resume actions without exposing internal paths or provider data.
- Implement accessible validation summaries and stable refresh/poll behavior.

## Out Of Scope

Arbitrary workflow authoring, low-level step execution, billing, publication, and
unsupported profile fields.

## Acceptance

- Provider-free create-to-completed-workflow UI integration test passes.
- Stale edits return a useful 412 conflict flow without overwriting newer content.
- Duplicate submissions do not create duplicate episodes or workflow runs.
- Permission and unsupported-entitlement states fail clearly.

## Reports

Create the plan implementation report and Codex run report required by the pack README.
