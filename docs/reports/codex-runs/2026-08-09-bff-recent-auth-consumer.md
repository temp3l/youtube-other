# BFF recent-auth consumer

Summary: added a server-only consumer boundary for one-time recent-auth confirmations and propagated the OIDC session ID as a non-rendered CSRF binding. Missing consumer or CSRF binding fails closed.

Changed paths: web recent-auth consumer/test, BFF identity contract, OIDC identity adapter, runtime options.

Checks: `pnpm test:focused -- apps/web/src/recent-auth-step-up.unit.test.ts` passed.

Risks: deployment composition must supply the consumer backed by `PostgresRecentAuthConfirmationRepository`; integrations mutations have not yet been wired to consume it.

Follow-up: connect composition adapter and gate credential/webhook actions before rendering those controls.
