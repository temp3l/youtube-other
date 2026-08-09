# OIDC step-up hook

Summary: added an optional, fail-closed OIDC step-up callback. It requires a stable principal match, `auth_time` within five minutes, MFA AMR, and the exact server session/CSRF binding before invoking the persisted confirmation recorder.

Changed paths: OIDC BFF and session fixtures.

Checks: web typecheck passed after one targeted TypeScript repair.

Risks: deployment composition must supply `beginStepUp`, `completeStepUp`, and persisted `recordRecentAuth`; absent hooks return 403. Integration mutations are still not gated or rendered.

Follow-up: wire the persistence recorder into deployment composition, consume confirmations before credential/webhook mutations, then implement the integration UI.
