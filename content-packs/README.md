# YouTube Positioning Series — Multilingual Narration Pack v1

This pack contains the complete narration layer for a six-video long-form series and eighteen supporting Shorts.

## Languages

- `en` — English
- `de` — German
- `it` — Italian
- `fr` — French
- `pt` — Portuguese (Brazilian-leaning neutral; suitable as the default broad-audience Portuguese master)

## Contents

- **6 long-form videos × 5 languages = 30 narrations**
- **18 Shorts × 5 languages = 90 narrations**
- **120 narration Markdown files total**
- localized title metadata
- stable cross-language content IDs
- a shared visual-reuse manifest
- narration length estimates and integrity hashes

## Visual reuse design

Visuals are intentionally **not localized**. Generate one visual set per `contentId`, preferably from the canonical English semantic plan in `meta/visual-reuse-manifest.json`, then reuse the same image/video assets in every language.

Generated images should contain **no baked-in readable text**. Any titles, labels, diagram copy, captions or calls to action should be added as render-time overlays and localized independently. This is the key constraint that prevents language localization from triggering image regeneration.

Localized narration follows the same semantic sequence as English, but it is written naturally rather than translated word-for-word. TTS duration will therefore differ slightly by language. Re-time scene holds to narration beats; do not change the scene order. For still images, extend or shorten the hold. For reusable motion clips, trim or loop only where visually safe.

## Folder layout

```text
long/{locale}/...       # 6 long-form narration files per language
shorts/{locale}/...     # 18 short narration files per language
meta/long-titles.json
meta/shorts.json
meta/visual-reuse-manifest.json
meta/narration-lengths.json
meta/sha256.json
```

## Production rule

Use `contentId` as the immutable cross-language identity and `visualAssetKey` as the visual cache key. A change of locale must not invalidate `visualAssetKey`.

Recommended cache identity:

```text
visual-cache-key = seriesId + contentId + visualPlanVersion
```

Do **not** include language, narration text, translated title, TTS voice, or subtitle locale in the visual cache key.

## Narration files

Narration Markdown files contain narration only. They intentionally exclude headings, scene directions, citations and production notes so they can feed directly into TTS.

## Source basis

The series is a transformative educational synthesis of the uploaded Italian positioning transcripts. It consolidates repeated material and preserves the corpus themes: perceptual positioning, niche specificity, expert recognition, content-led authority, books as positioning assets, and repositioning when a business changes.


## v2 editorial optimization

This pack has been reviewed by a multilingual YouTube retention/editorial pass.

- Six long-form hooks and titles optimized.
- Concrete pattern interrupts added to L03, L04, and L05.
- Six lower-scoring Shorts rewritten.
- Remaining Shorts reviewed and retained where already production-ready.
- Localized titles and spoken phrasing normalized.
- Visual semantic order preserved across all five locales.
- See `EDITORIAL-REVIEW-AND-RATINGS.md`, `LOCALIZATION-QA.md`, and `meta/ratings-before-after.json`.
