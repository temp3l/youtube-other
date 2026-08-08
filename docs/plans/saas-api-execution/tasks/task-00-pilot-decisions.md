# Task 00: Pilot Decisions

## Objective

Turn every unresolved product, security, and infrastructure choice into a
signed decision before production or deployment behavior is changed.

## Scope

- Re-verify `docs/api-plan/20-decision-register.md`, `21-risk-register.md`, and
  `PLAN-STATUS.md` against current source.
- Define the pilot profile/locale/variant matrix and excluded capabilities.
- Select the IdP, web/BFF stack, hosting target, PostgreSQL, secret/KMS, and
  S3-compatible storage deployment.
- Decide OAuth ownership, private-first publication, quotas, retry-cost owner,
  retention/residency, RTO/RPO, SLO, compatibility window, and escalation owner.
- Record decision owners, dates, evidence, and explicit deferred items.

## Out Of Scope

Production code, dependency changes, infrastructure provisioning, credentials,
provider calls, and publication.

## Acceptance

- Each required choice is `accepted` or `blocked` with an owner and follow-up.
- The first pilot journey and capability matrix are unambiguous.
- No deferred decision is silently converted to a code default.
- `./scripts/validate-api-plan.sh` and targeted docs formatting pass.

## Execution Note

Use `terra/high` for evidence collection and options. Stop for human selection
where business ownership is required; do not choose vendors on the user's behalf.

## Reports

Create the plan implementation report and Codex run report required by the pack README.
