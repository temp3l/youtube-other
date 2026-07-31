# ADR-API-005: Authentication and Tenancy

- **Status:** Board accepted
- **Date:** 2026-07-31
- **Confidence:** Medium

## Question

How are human and machine callers authenticated and isolated?

## Repository evidence

No platform auth/tenant layer exists. Current Google OAuth only authorizes YouTube provider access, and state/assets are root/path scoped.

## Options

OIDC handles humans/federation; OAuth client credentials handles services; scoped opaque API keys simplify pilots but require lifecycle controls. Shared-table tenant isolation is incremental; database-per-tenant is stronger but costly.

## Impacts

Workspace-scoped repositories and credential/asset isolation are mandatory for security. Operations require issuer, key, membership, rotation, and incident lifecycle.

## Recommendation

OIDC humans, OAuth client credentials service accounts, optional hashed scoped API keys for pilot. Use `workspace_id` on all tenant records and object bindings; credentials stay in a secrets manager/encrypted store. Start shared-database with composite tenant keys and tests.

## Conditions that change it

Enterprise/regulatory demand may require Keycloak specifically, customer-managed issuers, regional shards, row-level security, schemas, or databases per tenant. Operator must choose issuer and pilot key policy.

## Consequences

YouTube refresh tokens are not authentication credentials and never enter public workflow payloads.
