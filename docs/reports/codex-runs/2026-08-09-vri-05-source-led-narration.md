# VRI-05 source-led narration

Date: 2026-08-09

## Summary

Removed production fixture fallbacks for source manifests, evidence approvals, narration, captions, audio, and metadata. Source adaptation now persists a source-bound editorial outline and revision identity under canonical `veronicabenini`; narration revisions support immutable freeze records and diffs. Timing-only edits invalidate audio/captions/alignment while preserving visual work.

## Changed paths

- `packages/strategic-reinvention/src/{source-adaptation-bridge.ts,episode-pipeline.ts,source-adaptation.ts,provenance-validation.ts}`
- `packages/veronica-media/src/narration/revision.ts`
- `packages/story-localization/src/narration-constraints.ts`
- Focused unit tests beside those modules.

## Checks

- PASS: focused source-adaptation bridge (3 tests)
- PASS: focused narration revision (1 test)
- PASS: focused narration constraints (4 tests)
- BLOCKED: strategic typecheck has pre-existing unresolved workspace imports in multilingual/package, publishing, task-registry, and workflow-operator. The stale profile-id comparison was corrected during this task.

## Risks / follow-up

Production episodes must supply the approved manifest and immutable source-evidence ledger before adaptation. Downstream approved media capabilities remain responsible for audio, captions, and metadata.
