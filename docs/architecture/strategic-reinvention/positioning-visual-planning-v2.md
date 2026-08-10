# Veronica positioning visual planning V2

The positioning-series planner is a Veronica-only, deterministic planning path. It converts canonical English narrative beats into communication intent, semantic treatment, optional proposition-specific topology, subject/continuity requirements, environment, composition, camera, props, motion opportunities, text-free base assets, and render-time FFmpeg events. It does not call an image, speech, music, or publishing provider.

## Persisted artifacts

- `plans/*.visual-plan.json`: versioned canonical V2 plans, including cold opens, Short progression, safe regions, continuity, reuse decisions, metrics, thumbnails, overlays, CTA/end-screen coverage, and hashes.
- `vocabularies/*.visual-vocabulary.json`: one cached vocabulary per long-form episode, shared with its supporting Shorts.
- `localization/*.title-qa.json`: separately cached title/transcreation QA for five locales.
- `bulk-visual-review-<generatedAtMs>.json`: timestamped 24-plan reviewer projection plus cluster and series metrics. Its filename timestamp exactly matches the envelope's Unix epoch-millisecond `generatedAtMs`; this observational field is excluded from the deterministic semantic `reviewPackHash`. `bulk-visual-review.json` remains a byte-identical latest-pack compatibility alias.
- `veronica-positioning-visual-review-pack-<generatedAtMs>.zip`: timestamped fixture review archive when the pack is bundled for handoff.
- `before-after-aggregate-metrics.json`: V1 fixture baseline versus V2 output.

Generated images always remain text-free. Localized titles, hook overlays, labels, and subtitles are rendered separately.

## Cache invalidation graph

```text
canonical narrative meaning / semantic beats / planner version
  -> visual vocabulary
  -> semantic treatment plan
  -> canonical image plan
  -> render-event plan

localized title change
  -> title/transcreation QA + overlay layout only

image provider/model change
  -> generated-asset cache key + canonical image-plan hash
  (semantic treatment/vocabulary remain reusable)

FFmpeg renderer/timing change
  -> render-event cache key only
```

Punctuation, translation, localized title, TTS voice, and subtitle changes do not invalidate canonical imagery. V1 plans remain inspectable but require explicit V2 replanning; a legacy image is reusable only after its semantic fingerprint matches.

## Diversity calibration

The reviewed V1 fixture measured 98.4% duplicate complete visual grammar, 98.94% duplicate subjects/environments/props, 98.94% duplicate compositions, 98.4% duplicate cameras, and 89.8% duplicate diagram topology. These are normalized structured-feature measurements, not prompt-string equality.

V2 per-video gates allow limited branding continuity while blocking production-template repetition: complete grammar 25%, subject 45%, environment/composition/camera/props 55%, and diagram topology 75%. Consecutive-scene similarity blocks above 0.72; Short hook-to-scene-one similarity blocks above 0.65. Persistent-protagonist identity is exempt only from the subject-identity duplicate count; repeated environment, composition, camera, props, topology, and consecutive grammar remain gated. The looser single-feature limits preserve recurring coral/warm-paper branding while the stricter combined-grammar and adjacency gates catch visibly repetitive staging.

Openings have an additional viewer-visible fingerprint over strategy, subject, environment, composition, camera, lighting, action, dominant physical object, and motion. It deliberately excludes content/treatment IDs, narration, semantic tokens, locale, overlay text, and prop instance labels. Every long-form-plus-three-Short cluster requires zero exact duplicates and at least three materially different grammars; series-wide duplicate rate is capped at 15% and one signature may occur at most twice.

Long-form cross-episode similarity compares ordered two-scene windows rather than an unordered single-scene maximum. A score above 0.82 is a review warning and above 0.88 is a blocker. This preserves recurring brand motifs while detecting repeated treatment sequences.

Diagram topology remains proposition-derived and fail-closed. Where multiple structures are semantically valid, deterministic parent-cluster usage context prefers the least-repeated topology; unsupported temporal/process substitutions are excluded. The review reports distribution, consecutive repeats, cluster concentration, fallback use, and semantic justification instead of pursuing artificial uniqueness.

Title QA keeps the full metadata title separate from an overlay-safe display title. Approved one- or two-line layouts are validated per locale without reducing the readability floor; title-only changes remain excluded from canonical image identity.

Event cadence targets a perceptible change every 3–7 seconds. Hooks and cold opens use faster multi-event treatment; slower events are permitted only through the reported compliance rate and fail below 90% fixture compliance.

## Operator command

```bash
pnpm mediaforge -- veronica-media plan-positioning-series \
  --pack content-packs/veronica-content-pack-1 \
  --output content-packs/veronica-content-pack-1/visual-review \
  --json
```

Review the pack before authorizing any paid image generation.
