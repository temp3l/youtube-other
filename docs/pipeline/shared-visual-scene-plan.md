# Shared Visual Scene Plan

Shared visual images are canonical per video variant and language-independent. A full video and a short video are separate visual variants, so each variant owns its own scene plan and image set.

## File Layout

```txt
episodes/<episode>/visuals/full/scene-plan.json
episodes/<episode>/visuals/full/images/scene-001.png
episodes/<episode>/visuals/short/scene-plan.json
episodes/<episode>/visuals/short/images/scene-001.png
episodes/<episode>/languages/<lang>/<variant>/script.md
episodes/<episode>/languages/<lang>/<variant>/audio.mp3
episodes/<episode>/languages/<lang>/<variant>/alignment.json
episodes/<episode>/languages/<lang>/<variant>/visual-validation.json
```

Supported languages are `en`, `de`, `es`, `fr`, and `pt`.

## Render Rules

- Full renders read `visuals/full/scene-plan.json` and `visuals/full/images`.
- Short renders read `visuals/short/scene-plan.json` and `visuals/short/images`.
- Short renders must never reuse full images.
- Full renders must never reuse short images.
- Localized alignments map narration timing back to canonical `sceneId` values.

Longer localized narration holds the same canonical image longer. Shorter localized narration holds the same image for less time or intentionally merges nearby beats. Localized narration cannot silently add new visible events, locations, characters, important props, or reveal-order changes.

## Validation

Localized visual validation blocks missing scene IDs, unknown scene IDs, reordered scenes, missing images, cross-variant manifest references, and cross-variant image paths. Duration drift produces warnings when the canonical visual beat still matches.

Regeneration is allowed only through explicit image-generation configuration. By default, localized languages reuse canonical images for the same variant.

## Example Flow

```bash
pnpm mediaforge -- images batch prepare --episode 022-the-whistler-in-the-woods --languages en --variants full
pnpm mediaforge -- images batch prepare --episode 022-the-whistler-in-the-woods --languages en --variants short
```

Future CLI wiring should expose dedicated commands for canonical visual manifest generation, localized alignment, localized validation, and render with canonical image reuse.

## Troubleshooting

- Missing short image: generate `visuals/short/images/<sceneId>.png`; do not point to full images.
- Blocked validation: rewrite localized narration or explicitly approve regeneration.
- Wrong variant path: update manifest image paths to `visuals/<variant>/images`.
- Duration warning: reuse the image with slower or subtler motion.

