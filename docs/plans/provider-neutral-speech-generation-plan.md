# Provider-neutral speech generation plan

Date: 2026-08-01
Status: implementation

1. Add Zod-backed provider, profile, consent, generation, state, cost, chunk, cache, and
   error contracts to `@mediaforge/speech`.
2. Add deterministic NFC/canonical-JSON cache identity, semantic chunking, central state
   transitions, consent enforcement, quota orchestration ports, and a single
   `SpeechGenerationService`.
3. Wrap existing OpenAI behavior and add a typed streaming ElevenLabs HTTP adapter with
   URL allowlisting, timeout/abort support, response validation, and stable error mapping.
4. Extend narration mastering with a versioned 48 kHz mono FLAC profile and measured
   two-pass loudness normalization while retaining raw chunk artifacts.
5. Add additive PostgreSQL speech tables, constraints, indexes, RLS, profile resolution,
   cache leases, and usage reservation persistence. Preserve legacy records and provide
   an explicit OpenAI backfill operation.
6. Compose API, CLI, workflow, and frontend-facing contracts around the same application
   service. Keep legacy commands as deprecated compatibility adapters during cutover.
7. Add focused unit, provider, integration, API/CLI, persistence, audio, and UI contract
   tests without paid provider calls.
8. Add ADRs, setup/security/consent/cost guidance, recovery runbooks, listening-test
   materials, migration/rollback notes, and rollout instructions.
9. Audit direct provider calls, sensitive logging, feature-disabled behavior, profile
   precedence, cache/quota concurrency, and OpenAI regression behavior.

The frontend repository currently has no application framework. This implementation will
add an accessible server-renderable administration view model and HTML surface without
introducing a second provider-aware client path; richer client interactivity can build on
the same API contracts later.
