# Security Threat Model

## Scope and trust boundaries

- **Verified:** the platform executes AI, TTS, Google APIs, FFmpeg, local/remote renderers, and filesystem mutations (`packages/process-runner/src/index.ts`, `packages/rendering/src/index.ts`, `packages/youtube-upload/src`, and `packages/image-generation/src`).
- **Verified:** the process runner uses argument-array spawning and an executable allowlist (`packages/process-runner/src/index.ts:runCommand`), but CLI subprocess bridges remain capable of reading process environment and local workspaces.
- **Verified:** path containment and symlink checks exist in `packages/shared/src/episode-filesystem.ts` and `packages/workflow-engine/src/artifact-repository.ts`; not all callers use one universal storage port.
- **Inferred:** moving from a trusted local operator to hostile multi-tenant inputs changes the threat model materially.

## Threat register

| Threat                            | Current evidence                                                   | Required control                                                                                 | Verification                                    |
| --------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------ | ----------------------------------------------- |
| Broken object-level authorization | no tenant-aware repository/API guard exists                        | workspace-scoped repositories and deny-by-default policy                                         | cross-tenant integration suite                  |
| Cross-tenant asset access         | local roots are caller/config selected                             | opaque asset IDs, server-generated keys, scoped signed URLs                                      | guessed-ID and URL-expiry tests                 |
| Path traversal/symlink escape     | several good containment helpers; uneven adoption                  | reject public paths; one asset port; realpath/lexical checks in bridge                           | traversal, symlink, race fixtures               |
| Shell injection                   | allowlisted array spawning exists; direct spawn also exists        | no shell strings; typed renderer commands; sandbox worker identity                               | metacharacter and executable substitution tests |
| Unsafe CLI subprocess bridge      | `story-audio-command.ts` and `story-images-command.ts` invoke CLI  | internal-only transitional adapter; fixed command mapping; no raw argv                           | fuzz options; environment/timeout tests         |
| SSRF through external assets      | configurable base URLs and network fetches exist                   | download broker, HTTPS, DNS/IP allow policy, redirect revalidation, byte/time caps               | loopback/link-local/rebinding tests             |
| Malicious uploads                 | no public upload surface exists                                    | presigned staged upload, type sniffing, size/dimension/duration limits, malware scan, quarantine | polyglot/decompression-bomb corpus              |
| Prompt injection                  | authored/provider content enters prompts                           | label sources untrusted, isolate instructions, allowlisted tools, human gate before publish      | adversarial source fixtures                     |
| Secret/YouTube credential leakage | redaction helpers exist in observability/shared                    | secrets manager, short-lived access, comprehensive structured redaction, no secrets in jobs      | canary-secret log tests                         |
| Webhook forgery/replay            | no webhooks exist                                                  | HMAC SHA-256 over timestamp + raw body, 5-minute tolerance, delivery ID dedupe                   | replay/tamper tests                             |
| Resource exhaustion/render DoS    | renderers can consume large CPU/disk                               | per-plan limits, admission quotas, isolated workers, cgroups, timeouts, disk preflight           | quota and kill/recovery tests                   |
| Duplicate publishing              | reports/checkpoints exist but acceptance-to-checkpoint gap remains | publication intent ledger, single lease, provider reconciliation, operator resolution            | crash at every mutation boundary                |
| Log injection                     | user/provider strings are logged                                   | JSON logs, field length/control-char normalization, no concatenated audit records                | newline/control-character tests                 |
| Sensitive prompts/telemetry       | telemetry stores argv, details, paths, provider errors             | data classification, field allowlists, hashing, retention, workspace-scoped access               | schema and retention tests                      |

## Publication-specific abuse cases

- **Verified:** `executeYoutubeMutationSequence` calls `videos.insert` and only then calls `onSuccess`; a process death between YouTube acceptance and checkpoint persistence can lose the returned video ID.
- **Verified:** the generic publisher can resume from an authority-loaded prior report (`packages/youtube-upload/src/generic-media-publish.ts:publishYoutubeMedia`), while the legacy upload path writes a planned report and final report but does not checkpoint each successful mutation (`packages/youtube-upload/src/index.ts:uploadYoutubeVideo`).
- **Recommended:** public publication must use a database-backed publication intent and never the legacy wrapper directly. A unique `(workspace_id, channel_id, request_fingerprint)` constraint, fenced worker lease, pre-mutation intent state, and post-timeout provider reconciliation are mandatory.
- **Unresolved:** YouTube does not provide a general client-selected idempotency token for `videos.insert`; the recovery lookup needs a platform marker embedded in upload metadata and operator review if reconciliation is ambiguous.

## Worker hardening

Render/provider workers run without database-admin or cross-tenant storage credentials. Each claim grants one workspace/job scope, explicit input asset handles, output prefix, cost budget, deadline, and abort signal. Network egress is allowlisted by worker class. FFmpeg/renderer containers run non-root with resource limits and read-only base filesystems; untrusted SVG/HTML is sanitized before rendering.

## Security release gates

External pilot is blocked until BOLA tests, credential encryption, webhook signing, upload validation, publication crash tests, quota enforcement, audit immutability, dependency/container scanning, and an incident runbook pass. GA additionally requires penetration testing, key rotation drills, tenant backup/restore tests, and deletion/retention verification.
