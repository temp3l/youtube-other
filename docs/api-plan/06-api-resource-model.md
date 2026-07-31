# API Resource Model

## Containment

```text
Workspace
├── memberships, service accounts, API keys, webhook endpoints
├── Projects
│   ├── brand/content profiles, channels, series, presets
│   ├── content sources, story bibles, curriculum sources, references
│   └── Episodes
│       ├── workflow runs → jobs → read-only step summaries
│       ├── assets and validation results
│       ├── approvals
│       └── publications → publishing targets
└── usage records and audit events
```

## Resource responsibilities

| Resource                        | Contract                                                                   |
| ------------------------------- | -------------------------------------------------------------------------- |
| Workspace                       | tenant, policy, quota boundary                                             |
| User                            | IdP-backed human membership reference                                      |
| Service account / API key       | non-human principal and scoped credential metadata                         |
| Project                         | groups configuration and content                                           |
| Brand/content profile           | revisioned, typed `dark_truth` or `mathematics_education` policy           |
| Channel                         | tenant-owned YouTube identity metadata; credential is only a secret handle |
| Series                          | editorial grouping/default playlists/presets                               |
| Episode                         | stable production unit with typed profile input and revision               |
| Content source                  | provenance-bearing text/upload reference                                   |
| Story bible / Curriculum source | profile-owned revisioned resource                                          |
| Reference asset                 | approved logical reference to immutable asset                              |
| Locale / Preset                 | supported catalog and revisioned audio/presentation/render selection       |
| Workflow template               | server-managed high-level recipe                                           |
| Workflow run                    | execution over an episode revision                                         |
| Job                             | asynchronous command/batch handle                                          |
| Step                            | read-only abstract phase status, never publicly executable                 |
| Asset                           | immutable descriptor with opaque delivery actions                          |
| Validation result               | immutable profile-owned evidence envelope                                  |
| Approval                        | attributable decision bound to server-derived hashes/revision              |
| Publishing target / Publication | channel policy and durable irreversible intent                             |
| Webhook endpoint                | subscription/signing-secret lifecycle                                      |
| Usage record / Audit event      | read-only metering fact / immutable action fact                            |

## Public naming and data rules

- IDs are opaque; paths, CLI syntax, package/task implementation names, storage keys, provider bodies, credentials, and prompt bodies are never resources.
- Asset responses expose kind, MIME, bytes, SHA-256, lifecycle, provenance, and retention—not a local path.
- Common envelopes do not erase domain rules. Episode `content` is a strict versioned union; story-bible/reference and curriculum/grade/difficulty/preset rules stay typed.
- Workflow definitions, worker leases, attempts, provider callbacks, reconciliation, and dead-letter administration live under `/_internal/v1`.

## Lifecycle and mutability

Profiles, content sources, bibles, curricula, presets, episode inputs, and metadata are revisioned. Assets and validation results are immutable. Approvals append/revoke rather than overwrite. Mutable configuration uses ETags. Publications bind immutable revision/hash references.
