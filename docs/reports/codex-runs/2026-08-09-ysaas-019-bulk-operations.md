# YSAAS-019 bulk operations BFF

Summary: Added a server-rendered bulk page with bounded line selection, typed preflight, result rows, and launch/retry/cancel controls. The browser never calculates eligibility, quota, or child admission.

Changed paths: `apps/web/src/saas-api-bff.ts`, `apps/web/src/saas-modules/api-sdk-gateway.ts`, `apps/web/src/saas-runtime.ts`, `apps/web/src/saas-runtime.unit.test.ts`.

Checks: API SDK build and web typecheck passed. Focused `pnpm test:focused -- apps/web/src/saas-runtime.unit.test.ts` passed (4) outside the sandbox loopback restriction, including rendered and posted bulk cancellation.

Commits: `6167c53`, `67a64ed`.

Risks: Filter/pagination portfolio selection is not implemented; selection is bounded manual entry. Browser accessibility is source-reviewed only; no browser state was fabricated.
