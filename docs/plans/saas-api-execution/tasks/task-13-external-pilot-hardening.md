# Task 13: External Pilot Hardening

## Objective

Validate the restricted pilot against approved real infrastructure and controlled
provider effects while keeping publication disabled.

## Depends On

Task 12 and explicit human authorization for each external system and cost ceiling.

## Scope

- Deploy to the approved non-production environment with real IdP, database,
  secret/KMS, and object storage.
- Run tenant restore, secret/key rotation, worker loss/failover, webhook chaos,
  bounded load/soak, retention cleanup, and alert/escalation drills.
- Execute controlled provider smoke tests for only the entitled matrix cells with
  per-run and cumulative cost ceilings.
- Confirm provider retry-cost attribution, quota settlement, deletion/retention,
  support ownership, SLOs, and incident runbooks.
- Record immutable evidence without secrets or customer data.

## Out Of Scope

YouTube mutation, GA scale, unentitled profiles/locales, public signup, and billing.

## Acceptance

- Every external call was individually authorized and stayed within its ceiling.
- Tenant isolation, rotation, restore, failover, load, and alert gates pass.
- Unsupported or failed matrix cells remain unadvertised and disabled.
- Task 14 remains blocked unless all publication prerequisites have independent evidence.

## Reports

Create the plan implementation report and Codex run report required by the pack README.
