# V3.6 relation-IR hardening

Summary: Separated semantic relation IDs from evidence fingerprints, versioned unambiguous review provenance, generated field-level contracts, added focused golden/invariant coverage, and generated the hardened review ZIP.

Changed paths: `packages/history/src/v36/*`; `scripts/generate-history-v36-relation-{contract-docs,ir-review}.*`; `docs/history/v3.6/*`.

Tests/checks: V3.6 focused Vitest 59/59; `@mediaforge/history` typecheck; targeted ESLint; ZIP and SHA-256 manifest verification — all pass.

Commit hash: `37dce45aeace3855e09bed75918c3c9f146ea706`.

Unresolved risks: V3.6 still has no candidate extraction or map/diagram compiler; Phase 2 remains shadow-only.
