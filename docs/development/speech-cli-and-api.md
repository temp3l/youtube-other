# Speech CLI and API

CLI commands use the authenticated connected API (`MEDIAFORGE_API_BASE_URL` and
`MEDIAFORGE_API_BEARER_TOKEN`) and never load provider secrets:

```bash
mediaforge speech profiles list --workspace <id>
mediaforge speech profiles show <profile> --workspace <id>
mediaforge speech profiles validate <version> --workspace <id>
mediaforge speech estimate --workspace <id> --video <id>
mediaforge speech generate --workspace <id> --video <id>
mediaforge speech generate --workspace <id> --video <id> --profile <version> --force
mediaforge speech status <generation> --workspace <id>
mediaforge speech retry <generation> --workspace <id>
```

Generation creation requires `Idempotency-Key`. Policy and override mutations require an
ETag/`If-Match`. API routes are under `/v1/workspaces/{workspaceId}/speech/...`; the
generated OpenAPI document contains schemas and examples. Estimate responses expose the
resolved profile, provider, characters, advisory cost, quota effect, and expected cache
state. Non-admin responses redact provider voice identifiers. Stable speech error codes
are safe for operators; diagnostic causes stay server-side.
