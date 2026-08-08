# Task 04: External Adapter Composition

## Objective

Implement the approved deployable adapters for secrets, tenant object storage,
webhook signing, and provider credential resolution without exposing secret values.

## Depends On

Tasks 00–01.

## Scope

- Implement only the Task 00-selected secret manager/KMS and object-store adapters.
- Resolve opaque secret handles inside the least-privileged worker role.
- Bind tenant-prefixed quarantine, validation, promotion, signed download, and cleanup.
- Compose webhook secret resolution and rotation without plaintext persistence.
- Add conformance, cross-tenant denial, expired-signature, MIME/hash/size, and
  secret-redaction tests using local fakes/emulators.

## Out Of Scope

Customer production secrets, public uploads, live provider generation, and
publication credentials.

## Acceptance

- Application ports remain provider-neutral and existing local adapters still conform.
- Cross-workspace secret/object access fails opaquely and is audited.
- Logs, errors, events, and jobs never contain secret material or presigned URLs.
- Focused adapter tests and affected package typecheck pass.

## Reports

Create the plan implementation report and Codex run report required by the pack README.
