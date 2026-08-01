# ADR-SPEECH-002: immutable voice-profile versions

Status: accepted, 2026-08-01.

A logical profile has numbered DRAFT, ACTIVE, and DEPRECATED versions. Provider settings
never mutate after activation; changes create a version. Generations pin a version ID.
Database triggers prohibit configuration edits and deletion. Activation requires adapter
validation and, for cloned voices, valid channel/commercial/multilingual consent.
Deprecation preserves historical generation and audit records.
