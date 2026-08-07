# Goal 04 — History Publishing Readiness

## Scope boundary

Run only after all four semantic approval packs pass the portfolio acceptance test.

This is a publishing-only task.

Do not modify:
- narration facts;
- claims;
- entity typing;
- map geometry;
- diagram semantics;
- trusted-script authority;
- semantic gate logic.

## Required artifacts per episode

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

## Titles

Provide:
- one recommended final title;
- two alternates;
- one short title;
- one thumbnail text option with no more than four words.

Titles must remain accurate to the narration.

## Description

Include:
- compelling two-line opening;
- concise episode summary;
- chapters;
- attribution/credits placeholder;
- relevant keywords without stuffing.

## Chapters

Requirements:

```text
first timestamp = 00:00
at least 5 chapters
strictly increasing
each chapter >= 10 seconds
last chapter begins before the final 20 seconds
```

Use measured audio timing when available. Otherwise mark chapters as draft.

## Captions

Generate from measured narration timing.

If measured timing is unavailable:
- use provisional plan timing;
- mark captions draft;
- keep publishing state below `final`.

## Thumbnail brief

Include:
- one focal subject;
- background;
- contrast/tension;
- short text;
- mobile-legibility requirement;
- prohibited misleading elements;
- safe-zone guidance.

Do not generate thumbnail images in this Codex task.

## End screen

Reserve the final 20 seconds.

Specify:
- quiet visual area;
- next-video element;
- subscribe element;
- optional playlist;
- no critical labels under overlays.

## Upload checklist

Include:
- title reviewed;
- description reviewed;
- thumbnail rendered;
- captions reviewed;
- final audio measured;
- copyright/licensing checked;
- AI/synthetic-content disclosure decision;
- chapters verified;
- end screen configured;
- cards configured;
- private upload reviewed;
- monetization suitability reviewed.

## Portfolio release plan

Create:

```text
publishing/portfolio-release-plan.md
```

Recommend a publish order using:
- hook strength;
- topic appeal;
- visual readiness;
- cross-promotion;
- channel positioning.

## Readiness states

Use:

```text
drafted
reviewable
final
```

Do not mark `final` unless:
- final rendered video exists;
- final measured audio exists;
- final thumbnail exists;
- captions were reviewed;
- a human reviewed upload metadata.

## Output

Regenerate the four episode ZIPs and combined ZIP with publishing artifacts included.

Preserve semantic-plan hashes where possible, or document why publishing-only packaging changes the bundle hash.
