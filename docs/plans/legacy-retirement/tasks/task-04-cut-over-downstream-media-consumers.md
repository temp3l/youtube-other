# Task 04: Cut Over Downstream Media Consumers

## Objective

Remove render and operator dependence on root or alternate narration
compatibility files.

## Scope

Rendering audio resolution, story render commands, workflow status/inspect
helpers, Dark Truth orchestration, upload input preparation, and narration path
promotion.

## Procedure

1. Inventory every consumer of `audio/narration.wav` and alternate
   `narration.wav` candidates; separate Dark Truth from math contracts.
2. Make consumers resolve the promoted staged artifact and verify its manifest,
   checksum, locale, variant, and `READY` quality gate.
3. Reject stale, ambiguous, or unmanifested audio instead of scanning fallback
   paths.
4. Update status and diagnostics to report the authoritative artifact and why a
   consumer is blocked.
5. Stop producing the root compatibility copy only after all registered
   consumers and operator scripts have moved.

## Validation

- Focused rendering, CLI, speech, and Dark Truth tests cover canonical input,
  stale quality state, missing manifests, and full/Short isolation.
- Representative dry-runs resolve the staged artifact without compatibility
  candidates.

## Completion gate

No active Dark Truth consumer requires the root compatibility narration copy;
math-specific narration contracts are either canonicalized or explicitly out
of scope with an owner.
