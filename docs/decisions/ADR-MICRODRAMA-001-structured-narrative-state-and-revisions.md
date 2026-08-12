# ADR-MICRODRAMA-001: Structured narrative state and revisions

Date: 2026-08-12
Status: accepted

## Context

Serialized microdrama continuity spans episodes, characters, relationships,
secrets, knowledge, promises, and reveal boundaries. Scripts, prompts, and media
cannot safely serve as the only source of that state.

## Decision

Runtime-validated, language-neutral narrative state is authoritative. SeriesBible,
Character, CharacterState, directional RelationshipState, NarrativeSecret,
KnowledgeClaim, NarrativePromise, and NarrativeSnapshot use stable IDs and
immutable revision envelopes with schema version, hash, parent/provenance,
status, and timestamps.

Scripts, prompts, scenes, shots, audio, images, timelines, and renders are
revision-linked projections. Model output cannot become accepted canon without
schema validation, deterministic transition validation, required QA, and an
explicit acceptance transition.

## Consequences

- Narrative Core stays provider- and persistence-independent.
- Accepted state can be replayed and audited without asking a model to reread
  old scripts.
- Canon changes invalidate dependent projections by recorded dependency, not by
  directory-wide regeneration.
- Importers preserve raw artifacts as provenance while compiling typed state.

## Alternatives rejected

- Markdown, prompts, scripts, media, or directory layout as canon.
- Reconstructing canon on demand with an LLM.
- Mutable in-place state without immutable revision lineage.
