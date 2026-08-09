# Recent-auth confirmation foundation

Summary: added persisted, one-time recent-auth confirmations. Each record is bound to workspace, principal, action, and CSRF session; consumption is atomic and only succeeds before expiry.

Changed paths: recent-auth persistence migration/repository/test, persistence exports/registry, and migration-order test.

Checks: `pnpm test:focused -- packages/persistence/src/postgres-recent-auth-confirmation-repository.unit.test.ts` passed.

Risks: no BFF identity binding or integrations mutations consume this primitive yet. Until that work is committed, the integrations page remains unavailable.

Follow-up: extend server identity/session data with stable principal and CSRF-session identifiers, then wire verifier use before credential/webhook mutations.
