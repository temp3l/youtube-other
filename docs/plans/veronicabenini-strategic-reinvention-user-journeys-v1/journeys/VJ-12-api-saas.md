# VJ-12 — Operate via API / SaaS

## Primary actor
API / SaaS Consumer

## Main flow
1. Client creates or imports an episode through a versioned API.
2. Client uploads/links source assets.
3. Client starts a production run with an idempotency key.
4. Client polls or receives events for stage/status changes.
5. Client retrieves structured artifacts and approval-pack metadata.
6. Authorized reviewer records approval/rejection.
7. Client requests localization, regeneration, rendering, or publishing.
8. API returns stable typed errors and resource revisions.
9. Tenant isolation applies to source material, provider settings, artifacts, and logs.

## Success outcome
Every major creator workflow can be automated without bypassing governance or auditability.
