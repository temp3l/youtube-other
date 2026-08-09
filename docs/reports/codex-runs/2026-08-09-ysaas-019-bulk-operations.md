# YSAAS-019 bulk operations BFF

Summary: Added a server-rendered bulk page with bounded line selection, typed preflight, result rows, and launch/retry/cancel controls. The browser never calculates eligibility, quota, or child admission.

Changed paths: `apps/web/src/saas-api-bff.ts`, `apps/web/src/saas-modules/api-sdk-gateway.ts`, `apps/web/src/saas-runtime.ts`.

Checks: API SDK build and web typecheck passed. Focused `saas-runtime.unit.test.ts` was blocked before journey assertions because the sandbox rejects loopback listen with `EPERM`.

Commit: `6167c53`.

Risks: Filter/pagination portfolio selection is not implemented; selection is bounded manual entry. Browser accessibility is source-reviewed only; no browser state was fabricated.
