# Task 11: Tenant Identity And Authorization

## Objective

Enforce workspace isolation for humans, services, workers, credentials, and every tenant-owned resource.

## Scope

- validate OIDC/JWKS identities and service principals
- implement scoped, expiring, hashed pilot API keys without publication permission unless approved
- require authorization context in repositories and composite workspace constraints
- enable PostgreSQL RLS with transaction-local tenant context safe under pooled connections
- resolve channel/provider credentials through tenant-scoped encrypted handles
- return opaque 404 for missing or foreign resources

## Tests And Verification

Add owner, insufficient-role, guessed-ID, revoked-principal, expired-key, RLS-pool-reuse, worker-scope, and cross-workspace credential tests.

## Acceptance Criteria

No public or worker path can load a tenant resource by global ID alone, and tenant context cannot leak between pooled database transactions.
