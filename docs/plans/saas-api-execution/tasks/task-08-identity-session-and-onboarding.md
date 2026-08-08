# Task 08: Identity, Session, And Onboarding

## Objective

Provide secure sign-in, workspace selection, invitation/provisioning, and sign-out
for the restricted pilot while keeping tenant membership authoritative in the API.

## Depends On

Tasks 04, 06, and 07.

## Scope

- Integrate the selected OIDC authorization-code flow with PKCE and server-side session.
- Map the OIDC subject to the active principal directory and workspace memberships.
- Implement workspace selection, session renewal, logout, expiry, revocation, and
  opaque unauthorized/cross-tenant behavior.
- Keep pilot invitation/principal provisioning operator-controlled unless Task 00
  explicitly approves self-service onboarding.
- Record security-relevant session events without tokens or claims leakage.

## Out Of Scope

Password storage, unapproved social login, public signup, billing, and browser-held
API keys.

## Acceptance

- Happy path, expired session, revoked principal, issuer/key rotation, CSRF, open
  redirect, and cross-workspace tests pass with a local IdP fixture.
- The browser never receives reusable API or provider credentials.
- Permission changes take effect within the approved cache/refresh bound.

## Reports

Create the plan implementation report and Codex run report required by the pack README.
