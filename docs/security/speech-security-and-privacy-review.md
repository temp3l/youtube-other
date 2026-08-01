# Speech security and privacy review

- Credentials are backend environment secrets and redacted by structured logging.
- Provider URLs require HTTPS, no credentials/path/query, and a deployment allowlist.
- Requests have abortable timeouts; responses require audio content types and bounded
  size and stream to restricted temporary/artifact files.
- FFmpeg uses argument arrays, bounded stderr, timeouts, integrity probes, and cleanup.
- Workspace RLS and authorization protect profiles, consent, policies, overrides, retries,
  and artifacts. Mutations are audited and version checked.
- Narration, API keys, consent evidence, raw provider bodies, voice IDs, generation IDs,
  and request IDs are excluded from metrics/traces; logs retain only hashes and bounded
  operational identifiers.
- No new provider SDK dependency was added; the ElevenLabs adapter uses platform fetch.
  Dependency/license posture is therefore unchanged.

Residual risk: provider processing occurs under the configured provider agreement.
Operators must confirm lawful consent, retention, channel, and regional requirements.
