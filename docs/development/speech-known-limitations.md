# Speech known limitations and rollout

- No subtitle, word timestamp, forced alignment, or in-repository voice training exists.
- Provider seed values do not make synthesis reproducible; persisted artifacts are the
  authority.
- The web app is currently a server-rendered accessible administration foundation, not a
  reactive design-system application.
- Production object storage currently accepts bounded byte payloads; the local adapter
  streams to disk. A streaming object-store writer is the next scale improvement.
- Legacy OpenAI file-oriented commands remain during the compatibility window and must be
  removed only after all episode/math callers use the application service.
- Production API startup does not yet compose `SpeechApiUseCases`; speech routes return
  503 unless a deployment injects them. Persistence-to-application adapters for complete
  profile administration, status, cache waiting, quota reservation, and usage ledger
  behavior are still required.
- Concurrency and quota logic has conformance/unit coverage, but no PostgreSQL race test
  has yet demonstrated at-most-one provider call or hard-limit safety end to end.
- Canonical FLAC command construction is unit tested; deterministic fixture-based FFmpeg
  audio validation has not yet been run.
- Repository observability exposes a speech instrumentation port over current telemetry;
  deployment-specific Prometheus/OpenTelemetry exporters remain composition work.

Roll out contracts/OpenAI first, then persistence/cache/quota, ElevenLabs disabled,
development test voice, staging listening tests, one approved pilot genre, monitoring,
per-video overrides, and explicit expansion approval. Never activate the example profile
or make it a production default automatically.
