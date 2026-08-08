# Codex Run: Frontend Preview Proxy Form Fix

## Summary

Enabled an opt-in originless form-post mode exclusively for the in-memory local
demo, where the workspace preview proxy strips both origin headers.

## Changed Paths

- `apps/web/src/saas-runtime.ts`
- `apps/web/src/demo-entry.ts`
- Frontend demo report

## Tests

- Focused SaaS runtime test — 4 passed
- Web build — passed
- Originless demo form POST — returned HTTP 303

## Commit Hash

Base: `56d0129`; changes are uncommitted.

## Unresolved Risks

The originless mode is intentionally local-demo-only; production must retain
the default same-origin CSRF enforcement.
