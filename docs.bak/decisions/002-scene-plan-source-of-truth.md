# ADR 002: Scene plan as timing source of truth

## Status

Accepted

## Decision

Use the scene plan manifest as the source of truth for image ordering and rendering timing.

## Consequences

- Prevents directory-order bugs
- Makes resuming and regeneration deterministic

