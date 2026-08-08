# Task 12: Internal Pilot End To End

## Objective

Prove the selected SaaS journey end to end with isolated infrastructure and fake
providers before any external pilot exposure.

## Depends On

Tasks 02–11.

## Scope

- Create one deterministic pilot fixture matching the Task 00 capability matrix.
- Exercise sign-in, workspace selection, project/episode creation, workflow start,
  worker execution, status, asset review, validation, approval, usage/audit, and webhook.
- Inject cancellation, worker loss/reclaim, stale edit, revoked membership, quota
  exhaustion, webhook failure/replay, and object quarantine cases.
- Verify logs/events/errors for secret, token, raw path, prompt, and provider-payload leakage.
- Produce a reviewable internal-pilot evidence manifest.

## Out Of Scope

Paid providers, real customer identities/data, public URLs, production deployment,
and YouTube mutation.

## Acceptance

- One focused acceptance file proves the full provider-free journey.
- Faults converge to a safe terminal/retry/reconciliation state without duplication.
- The evidence manifest binds source revision, schemas, fixture hashes, and results.
- Any failed gate blocks Task 13 rather than being waived.

## Reports

Create the plan implementation report and Codex run report required by the pack README.
