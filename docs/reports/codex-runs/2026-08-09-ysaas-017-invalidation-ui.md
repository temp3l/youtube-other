# YSAAS-017 invalidation confirmation

Summary: completed the BFF invalidation journey. A preview stores only server-calculated targets for ten minutes and is bound to the workspace, project, and episode; confirmation queues precisely those targets with an idempotency key.

Changed paths: web runtime, BFF gateway, demo/test adapters, and API SDK client contracts.

Checks: API SDK build and web typecheck pass. `pnpm test:focused -- apps/web/src/saas-runtime.unit.test.ts` was blocked when the sandbox denied a loopback socket (`EPERM`) before journey assertions.

Risks: the input fingerprint is provided by an upstream server workflow; the UI does not calculate it. The in-memory pending preview store is intentionally suitable only for this single-process BFF and must become shared durable session state before horizontal scaling.

Follow-up: complete configuration persistence and replace process-local confirmation state when deploying multiple web instances.
