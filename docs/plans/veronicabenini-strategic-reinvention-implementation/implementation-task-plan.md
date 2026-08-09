# Implementation task plan

| Task | Priority | Primary stories | Dependencies | Safety |
| --- | --- | --- | --- | --- |
| [VRI-01](tasks/vri-01-canonical-veronica-identity-and-shared-contracts.md) | P0 | VER-001 | None | SERIAL |
| [VRI-02](tasks/vri-02-episode-lifecycle-revisions-archive-and-clone.md) | P0 | VER-002, VER-003, VER-004 | VRI-01 | SAFE_PARALLEL |
| [VRI-03](tasks/vri-03-mixed-source-ingestion-and-canonical-manifests.md) | P0 | VER-010, VER-011, VER-012, VER-013, VER-014, VER-015 | VRI-01 | SAFE_PARALLEL |
| [VRI-04](tasks/vri-04-shared-artifact-identity-cache-and-typed-invalidation.md) | P0 | VER-080, VER-081, VER-082, VER-084 | VRI-01 | SAFE_PARALLEL |
| [VRI-05](tasks/vri-05-source-led-editorial-outline-and-narration-revisions.md) | P0 | VER-020, VER-021, VER-022, VER-023, VER-024, VER-025 | VRI-03,VRI-04 | SERIAL |
| [VRI-06](tasks/vri-06-scene-visual-plan-policy-and-source-media-selection.md) | P0 | VER-030, VER-031, VER-035, VER-036 | VRI-05,VRI-03 | SAFE_PARALLEL |
| [VRI-07](tasks/vri-07-persisted-camera-direction-and-selective-references.md) | P0 | VER-033, VER-034 | VRI-04,VRI-06 | SAFE_PARALLEL |
| [VRI-08](tasks/vri-08-source-slide-redesign-and-composition-readability.md) | P0 | VER-032, VER-043 | VRI-03,VRI-06 | SAFE_PARALLEL |
| [VRI-09](tasks/vri-09-shared-semantic-content-with-16-9-and-9-16-derivatives.md) | P0 | VER-040, VER-041, VER-042 | VRI-06,VRI-08 | SERIAL |
| [VRI-10](tasks/vri-10-locale-editions-translated-overlays-and-visual-reuse.md) | P0 | VER-050, VER-051, VER-052, VER-053, VER-054, VER-055, VER-056 | VRI-05,VRI-06,VRI-09 | SERIAL |
| [VRI-11](tasks/vri-11-voice-policy-tts-timing-and-captions.md) | P0 | VER-060, VER-062, VER-063 | VRI-05,VRI-04 | SAFE_PARALLEL |
| [VRI-12](tasks/vri-12-revision-scoped-approvals-review-packs-and-remediation.md) | P0 | VER-070, VER-071, VER-072, VER-073, VER-074 | VRI-04,VRI-05,VRI-06 | SERIAL |
| [VRI-13](tasks/vri-13-canonical-veronica-workflow-orchestration-and-resume.md) | P0 | VER-083 | VRI-05,VRI-06,VRI-10,VRI-11,VRI-12 | SERIAL |
| [VRI-14](tasks/vri-14-ffmpeg-render-derivatives-and-previews.md) | P0 | VER-100, VER-101, VER-103 | VRI-09,VRI-10,VRI-11,VRI-12 | SAFE_PARALLEL |
| [VRI-15](tasks/vri-15-delivery-bundles-and-revision-bound-metadata.md) | P0 | VER-102, VER-110 | VRI-10,VRI-14 | SAFE_PARALLEL |
| [VRI-16](tasks/vri-16-approval-gated-publish-and-scheduling.md) | P0 | VER-111, VER-112, VER-113 | VRI-12,VRI-14,VRI-15 | SERIAL |
| [VRI-17](tasks/vri-17-bulk-production-preflight-and-aggregate-review.md) | P0 | VER-090, VER-091, VER-092, VER-093, VER-094 | VRI-03,VRI-04,VRI-12,VRI-13 | SAFE_PARALLEL |
| [VRI-18](tasks/vri-18-versioned-policy-provider-configuration-and-cost-controls.md) | P0 | VER-005, VER-061, VER-150, VER-151, VER-152, VER-153, VER-154 | VRI-01,VRI-04 | SERIAL |
| [VRI-19](tasks/vri-19-episode-and-production-api-parity.md) | P0 | VER-120, VER-121, VER-122 | VRI-02,VRI-13,VRI-18 | SAFE_PARALLEL |
| [VRI-20](tasks/vri-20-review-events-webhooks-and-tenant-isolation.md) | P0 | VER-123, VER-124, VER-125 | VRI-12,VRI-19 | SERIAL |
| [VRI-21](tasks/vri-21-failure-recovery-fallback-and-observability.md) | P0 | VER-130, VER-131, VER-132, VER-133, VER-134 | VRI-04,VRI-18,VRI-19 | SAFE_PARALLEL |
| [VRI-22](tasks/vri-22-revision-linked-analytics-ingestion.md) | P1 | VER-140 | VRI-16,VRI-19 | SAFE_PARALLEL |
| [VRI-23](tasks/vri-23-fork-from-successful-patterns.md) | P2 | VER-142 | VRI-02,VRI-22 | SAFE_PARALLEL |
| [VRI-24](tasks/vri-24-cross-format-and-locale-analytics-comparisons.md) | P2 | VER-141 | VRI-22 | SAFE_PARALLEL |
| [VRI-25](tasks/vri-25-compatibility-migration-and-legacy-path-containment.md) | P1 | Cross-cutting | VRI-01,VRI-13 | SERIAL |
| [VRI-26](tasks/vri-26-end-to-end-acceptance-operator-handoff-and-evidence.md) | P1 | Cross-cutting | VRI-13,VRI-14,VRI-16,VRI-17,VRI-19,VRI-20,VRI-21,VRI-22,VRI-23,VRI-24,VRI-25 | SERIAL |

Totals: P0 21, P1 3, P2 2.
