# ADR-SPEECH-001: one provider-neutral application service

Status: accepted, 2026-08-01.

All speech entry points depend on `SpeechGenerationService`; adapters translate one
provider request and response only. This centralizes profile resolution, consent, cost,
quota, cache ownership, state, retry, artifacts, usage, and observability. Legacy
file-oriented OpenAI commands are compatibility callers during rollout and must migrate
to the service before removal; they are not a second target architecture.
