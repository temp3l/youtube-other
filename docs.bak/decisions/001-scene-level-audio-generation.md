# ADR 001: Scene-level audio generation

## Status

Accepted

## Context

Scene-level generation keeps narration, timestamps, captions, and image timing aligned.

## Decision

Generate one audio file per scene instead of one monolithic narration asset.

## Consequences

- Easier per-scene regeneration
- Better alignment with images and captions
- Slightly more orchestration overhead

