# Speech CLI and API

CLI commands use the authenticated connected API (`MEDIAFORGE_API_BASE_URL` and
`MEDIAFORGE_API_BEARER_TOKEN`) and never load provider secrets:

```bash
mediaforge speech profiles list --workspace <id>
mediaforge speech profiles show <profile> --workspace <id>
mediaforge speech profiles create --workspace <id> --key <key> --display-name <name>
mediaforge speech profiles version <profile> --workspace <id> --language en --configuration '<json>'
mediaforge speech profiles validate <version> --workspace <id>
mediaforge speech profiles activate <version> --workspace <id> --revision <n>
mediaforge speech profiles deprecate <version> --workspace <id> --revision <n>
mediaforge speech estimate --workspace <id> --video <id> --language en --text <narration>
mediaforge speech generate --workspace <id> --video <id> --language en --text <narration> --idempotency-key <key>
mediaforge speech generate --workspace <id> --video <id> --language en --text <narration> --dry-run
mediaforge speech status <generation> --workspace <id>
mediaforge speech retry <generation> --workspace <id> --language en --text <same-narration> --idempotency-key <key>
mediaforge speech cancel <generation> --workspace <id>
```

Generation creation and retry require `Idempotency-Key`. Policy, override, activation,
and deprecation mutations require an ETag/`If-Match`. API routes are under
`/v1/workspaces/{workspaceId}/speech/...`; the
generated OpenAPI document contains schemas and examples. Estimate responses expose the
resolved profile, provider, characters, advisory cost, quota effect, and expected cache
state. Non-admin responses redact provider voice identifiers. Stable speech error codes
are safe for operators; diagnostic causes stay server-side.

Until canonical video narration storage is available, `text` and `language` are required
for estimate/generate. Retry requires the exact original normalized narration and pins the
failed generation's profile version. `--force` preserves lineage and never replaces the
ordinary cache authority.
