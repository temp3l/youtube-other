# ADR-SPEECH-003: no silent provider fallback

Status: accepted, 2026-08-01.

Once a profile resolves, its provider, model, and voice are fixed for that generation.
Transient failures retry only the failed chunk with bounded exponential backoff and
jitter. Authentication, invalid configuration, consent, content rejection, and hard
quota failures do not retry. Replacement with another profile is an explicit operator
action linked by `supersedesGenerationId`; it is never represented as equivalent output.
