# Cursor Phase 04 — Publishing Readiness

## Boundary

This phase begins only after all four semantic packs pass portfolio acceptance.

Do not modify:

- narration facts;
- claims;
- entity and qualifier typing;
- map geometry;
- diagram semantics;
- trusted-script authority;
- semantic gate logic.

## Required publishing artifacts per episode

Create:

```text
publishing/youtube-metadata.json
publishing/description.md
publishing/chapters.txt
publishing/thumbnail-brief.md
publishing/pinned-comment.md
publishing/end-screen-plan.json
publishing/upload-checklist.md
publishing/captions-en.vtt
```

## Metadata

Provide:

- one recommended title;
- two alternate titles;
- one short title;
- thumbnail text of no more than four words;
- concise description;
- relevant keywords without stuffing.

## Chapters

Requirements:

```text
first timestamp == 00:00
at least 5 chapters
strictly increasing
each chapter >= 10 seconds
last chapter begins before final 20 seconds
```

Use measured timing when available. Otherwise mark chapters draft.

## Captions

Use measured narration timing.

When only provisional timing exists:

- generate draft captions;
- mark them provisional;
- do not mark publishing final.

## Thumbnail brief

Include:

- one focal subject;
- background;
- visual tension;
- short text;
- mobile legibility;
- prohibited misleading elements;
- safe-zone guidance.

Do not generate actual thumbnail images in this phase.

## End screen

Reserve the final 20 seconds and specify:

- quiet visual zone;
- next-video element;
- subscribe element;
- optional playlist;
- prohibited critical labels beneath overlays.

## Upload checklist

Include:

- title reviewed;
- description reviewed;
- thumbnail rendered;
- captions reviewed;
- measured final audio;
- copyright/licensing review;
- altered/synthetic-content disclosure decision;
- chapters verified;
- end screen and cards configured;
- private upload reviewed;
- monetization suitability reviewed.

## Portfolio release plan

Create:

```text
publishing/portfolio-release-plan.md
```

Justify publish order using hook strength, visual readiness, topic appeal, channel positioning, and cross-promotion.

## Readiness state

Use only:

```text
drafted
reviewable
final
```

Do not use `final` until rendered media, measured audio, final thumbnail, reviewed captions, and human metadata review exist.

## Completion

Regenerate the episode and combined ZIP packages with publishing artifacts included.

Preserve semantic-plan hashes when possible. Explicitly explain packaging-only hash changes.
