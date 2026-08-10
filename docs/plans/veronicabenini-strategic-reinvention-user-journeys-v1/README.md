# Veronica Benini / Strategic Reinvention — User Journey & User Story Pack v1

`strategic-reinvention` is an internal alias for the existing `veronicabenini` genre.

This pack defines the product behavior for the Veronica Benini production workflow, from source ingestion through publishing and iteration. It is intended to be usable as product scope, backlog seed, acceptance baseline, and implementation-planning input.

## Product assumptions

- The genre supports source-driven episodes built from PDFs, presentations, documents, images, screenshots, and other supplied media.
- ChatGPT/LLM processing may adapt narration when required for coherence, localization, or visual synchronization.
- Embedded text is translated for localized outputs.
- Limited slide/media redesign is allowed when required for readability or target aspect ratio.
- Rendering is performed with FFmpeg or the repository's FFmpeg-based rendering layer.
- Approved or language-independent visual assets should be reused across localized editions instead of being regenerated without cause.
- 16:9 long-form and 9:16 short-form outputs are first-class production targets.
- Expensive provider calls are cached or reused where possible.
- Production is agentic but bounded by explicit review/approval gates.
- Deterministic, auditable artifact lineage is required for regenerated and localized outputs.

## Actors

1. Creator / Channel Owner
2. Editor / Reviewer
3. Production Operator
4. Administrator
5. Automated Production Agent
6. API / SaaS Consumer
7. Viewer
8. Localization Reviewer

## Journey catalog

| ID | Journey |
|---|---|
| VJ-01 | Create an episode from an idea |
| VJ-02 | Create an episode from mixed source material |
| VJ-03 | Produce narration and editorial structure |
| VJ-04 | Build the visual and multimedia plan |
| VJ-05 | Produce 16:9 and 9:16 editions |
| VJ-06 | Localize an approved episode |
| VJ-07 | Review, approve, reject, and remediate |
| VJ-08 | Regenerate safely after a change |
| VJ-09 | Bulk-produce multiple episodes |
| VJ-10 | Publish and distribute |
| VJ-11 | Recover from provider/runtime failures |
| VJ-12 | Operate via API/SaaS |
| VJ-13 | Analyze performance and iterate |
| VJ-14 | Administer genre configuration and providers |

## Epic catalog

| Epic | Scope |
|---|---|
| VER-EP-01 | Episode creation and lifecycle |
| VER-EP-02 | Source ingestion and extraction |
| VER-EP-03 | Narration and editorial adaptation |
| VER-EP-04 | Visual planning and multimedia reuse |
| VER-EP-05 | Aspect-ratio production |
| VER-EP-06 | Localization |
| VER-EP-07 | TTS, captions, and audio |
| VER-EP-08 | Review, approval, and audit |
| VER-EP-09 | Regeneration, caching, and idempotency |
| VER-EP-10 | Bulk production |
| VER-EP-11 | Rendering and delivery artifacts |
| VER-EP-12 | Publishing and metadata |
| VER-EP-13 | API/SaaS workflows |
| VER-EP-14 | Reliability, observability, and recovery |
| VER-EP-15 | Analytics and iteration |
| VER-EP-16 | Administration, policy, and cost controls |

## Definition of done for a story

A story is complete when:
- functional acceptance criteria pass;
- authorization and tenancy rules are enforced where applicable;
- idempotency is defined for retriable mutations;
- generated artifacts have lineage/provenance;
- failures are observable and actionable;
- affected-scope tests pass;
- no unrelated approved artifacts are regenerated;
- cost-bearing provider calls are bounded, cached, or explicitly justified;
- localization behavior is deterministic with respect to shared visual assets;
- all user-visible failure states have a recovery path.

## Files

- `actors-and-personas.md`
- `journeys/*.md`
- `epics/*.md`
- `story-index.csv`
- `journey-story-coverage.md`
- `non-functional-requirements.md`
- `product-decisions.md`
