# Security

## Authorization

Only process media you own, are licensed to reuse, or otherwise have permission to transform.

## URL handling

- Only supported public hosts are allowed.
- Localhost and private IP ranges are rejected.
- `file:` URLs are not used for remote fetches.
- Redirects must remain bounded and validated.

## Process execution

- Use argument arrays, not shell strings.
- Validate executable names.
- Enforce timeouts and cancellation.
- Capture stdout and stderr.

## Filesystem safety

- Keep artifacts inside the configured workspace.
- Use atomic writes.
- Do not overwrite source media.
- Validate imported images and manifests.

## Secrets

- Do not write credentials to manifests or logs.
- Redact API keys, tokens, cookies, and signed URLs.

