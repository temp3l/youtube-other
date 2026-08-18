# Veronica EN cost reconciliation attempt

Result: `BLOCKED_MISSING_API_USAGE_READ_SCOPE`.

The operator authorized the zero-request reconciliation. Official OpenAI documentation identifies the organization Costs endpoint as the invoice-reconciling source and shows an admin-scoped credential. The repository has a standard API key but no admin credential. A read-only `GET /v1/organization/costs` scope check returned HTTP 403: missing `api.usage.read`.

Local evidence remains nine unpriced terminal calls: eight connection errors without a provider response and one HTTP 400 rejected request missing its model parameter. None is treated as free without billing evidence.

Provider activity: model/QA/TTS/image/render/publish calls `0`; billing scope checks `1`; new spend `$0`; reservations `0`.

Changed: reconciliation evidence, ledger generator, consolidated and next-tranche reports. Check: JSON parsing, generator invariants, and `git diff --check`. Commit: none; HEAD `492543b`.

Risk/next: securely provide `api.usage.read`, rerun the same Costs query, then recompute exact EUR headroom before any paid operation.
