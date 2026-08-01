# Speech known limitations and rollout

- No subtitle, word timestamp, forced alignment, or in-repository voice training exists.
- Provider seed values do not make synthesis reproducible; persisted artifacts are the
  authority.
- The web app is currently a server-rendered accessible administration foundation, not a
  reactive design-system application.
- Production object storage currently accepts bounded byte payloads; the local adapter
  streams to disk. A streaming object-store writer is the next scale improvement.
- Legacy file-oriented commands execute through a deprecated service-backed facade and
  remain until episode journals and frontend-triggered actions call the API directly.
- API estimate/generate/retry currently require explicit narration text and language;
  canonical video narration lookup is not yet persisted.
- Consent and listening approvals are enforced, but their dedicated operator CRUD/API
  surfaces are not complete.
- The web app is a server-rendered state view, not an authenticated API client with forms
  or i18n.
- PostgreSQL race tests exist, but the final rerun after the completion patch can require
  local-container permission in restricted environments.
- Repository observability exposes a speech instrumentation port over current telemetry;
  deployment-specific Prometheus/OpenTelemetry exporters remain composition work.

Roll out contracts/OpenAI first, then persistence/cache/quota, ElevenLabs disabled,
development test voice, staging listening tests, one approved pilot genre, monitoring,
per-video overrides, and explicit expansion approval. Never activate the example profile
or make it a production default automatically.
