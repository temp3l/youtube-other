# Episode Image Generation

This repo now has a dedicated episode image pipeline for narrated videos. It keeps the existing workspace structure and OpenAI client flow, but adds:

- episode-local character registries;
- structured scene visual specs;
- adjacent-scene difference checks;
- prompt validation before paid image calls;
- text-only and reference-assisted generation modes;
- atomic output writing;
- resumable manifests.

## What Changed

The new pipeline lives in `packages/image-generation/src/episode-image-pipeline.ts` and is exposed through the CLI.

Key behavior:

- generate text-only images with `images.generate()` when no recurring character reference is needed;
- generate reference-assisted images with `images.edit()` when a recurring character appears;
- require approved character references unless `--allow-unapproved-character-references` is explicitly supplied;
- sync a source-pack `characters.json` into the episode workspace with `episode sync-characters`;
- bootstrap the shared episode character folder and reference images in one pass with `episode bootstrap-characters`;
- store character state in `episodes/<episode-id>/shared/characters.json`;
- store scene manifests in `episodes/<episode-id>/state/image-generation/manifests/`;
- store prompts in `episodes/<episode-id>/state/image-generation/prompts/`;
- store character reference images in `episodes/<episode-id>/shared/images/character-references/`;
- store canonical generated scene images in `episodes/<episode-id>/shared/images/generated/`;
- continue resolving legacy images from `episodes/<episode-id>/state/image-generation/images/` during migration;
- skip already valid outputs unless `--force` is supplied.
- render provider prompts from the structured visual spec, character context, text requirements, and continuity constraints rather than copying narration into visual fields.

## Migration Note

Existing scene manifests created before the scene-hash cache update will self-invalidate the next time the pipeline runs.
That one-time regeneration is expected: the pipeline now compares both the current scene hash and the prompt hash before reusing an output.
After the scene is regenerated once, the new manifest will include the hash fields needed for normal resumable reuse.
Stricter visual-plan validation can also turn previously planned scenes into failures when a scene has unresolved character continuity, contradictory required/excluded features, previous-scene narration leakage, empty locations, or overly verbose visual fields.
Review the persisted records under `state/image-generation/` before forcing regeneration.

## CLI Commands

Plan prompts without calling the image API:

```bash
npm run images:plan -- --episode 001-calhoun-experiment
```

Generate all images for an episode:

```bash
npm run images:generate -- --episode 001-calhoun-experiment
```

Generate a single scene:

```bash
npm run images:generate -- --episode 001-calhoun-experiment --scene scene-007
```

Force regeneration:

```bash
npm run images:generate -- --episode 001-calhoun-experiment --scene scene-007 --force
```

Generate a neutral reference image for a recurring character:

```bash
node apps/cli/dist/index.js images generate-character-references \
  --episode 001-calhoun-experiment \
  --character daniel-mercer
```

Sync the canonical source-pack character registry into the workspace:

```bash
npm run mediaforge -- episode sync-characters --episode 002-even-killers-can-lick
```

Bootstrap the registry and all reference images for the episode:

```bash
npm run episode:bootstrap-characters -- --episode 002-even-killers-can-lick --approve
```

Approve a character reference:

```bash
node apps/cli/dist/index.js images approve-character \
  --episode 001-calhoun-experiment \
  --character daniel-mercer
```

## Environment Variables

The image pipeline reads these environment variables:

- `OPENAI_API_KEY`
- `OPENAI_IMAGE_MODEL=gpt-image-2`
- `OPENAI_IMAGE_SIZE=1536x1024`
- `OPENAI_IMAGE_QUALITY=medium`
- `OPENAI_IMAGE_CONCURRENCY=1`
- `OPENAI_IMAGE_MAX_RETRIES=2`
- `OPENAI_IMAGE_TIMEOUT_MS=180000`

Optional transport settings:

- `OPENAI_BASE_URL`
- `OPENAI_ORGANIZATION`
- `OPENAI_PROJECT`

Optional workflow flags:

- `OPENAI_IMAGE_ALLOW_UNAPPROVED_CHARACTER_REFERENCES`
- `OPENAI_IMAGE_FORCE`

If a requested image size is not supported by the selected model, the pipeline resolves the closest supported landscape size, logs the resolved value, and writes it to the manifest.

## Character Registry

Characters are stored per episode in:

```text
episodes/<episode-id>/shared/characters.json
```

Example:

```json
{
  "episodeId": "001-calhoun-experiment",
  "updatedAt": "2026-06-25T00:00:00.000Z",
  "characters": [
    {
      "id": "daniel-mercer",
      "name": "Daniel Mercer",
      "role": "research narrator",
      "physicalDescription": "Adult man with a lean build and tired features.",
      "ageRange": "30s",
      "genderPresentation": "man",
      "face": {
        "shape": "angular",
        "skinTone": "light",
        "eyeColor": "hazel",
        "eyebrows": "thick",
        "nose": "straight",
        "mouth": "narrow",
        "distinguishingFeatures": ["small scar near left eyebrow"]
      },
      "hair": {
        "color": "dark brown",
        "length": "short",
        "style": "messy"
      },
      "build": "lean",
      "defaultWardrobe": {
        "upperBody": "dark field jacket",
        "lowerBody": "dark jeans",
        "footwear": "black boots",
        "outerwear": "",
        "accessories": ["grey backpack"],
        "carriedObjects": ["laptop"],
        "colors": ["dark grey", "olive"]
      },
      "continuityTraits": [
        "same facial structure",
        "same hairline",
        "same backpack",
        "same jacket"
      ],
      "referenceImagePath": "episodes/001-calhoun-experiment/shared/images/character-references/daniel-mercer.png",
      "referenceStatus": "approved"
    }
  ]
}
```

## Example Scene Specs

`scene-007` in the Calhoun experiment is a text-only scene. It shows the historical research context rather than a recurring person.

Example spec:

```json
{
  "sceneId": "scene-007",
  "sequenceNumber": 7,
  "narrativePurpose": "reveal",
  "focalSubject": "the broader research program behind Universe 25",
  "visibleAction": "a researcher reviews repeated enclosure studies and archive materials from the same project family",
  "environment": "dim archival laboratory with shelves, specimen drawers, and multiple identical habitat models",
  "foreground": "stacked folders, a lamp-lit desk, and one partially visible mouse habitat model",
  "background": "rows of cabinets and repeated experiment hardware fading into shadow",
  "shotSize": "wide",
  "cameraAngle": "eye-level",
  "composition": "left-weighted composition with leading lines from the desk toward repeated enclosure modules",
  "lighting": "single warm desk lamp with cool ambient fill",
  "timeOfDay": "late evening",
  "mood": "clinical unease",
  "distinctiveAnchor": "repeated enclosure studies and archive evidence that Universe 25 was one of many related experiments",
  "continuityElements": [
    "muted lab palette",
    "documentary realism",
    "no readable labels"
  ],
  "characters": [],
  "prohibitedElements": [
    "readable text",
    "logos",
    "watermarks",
    "gore",
    "fantasy distortion"
  ]
}
```

`scene-008` moves into the controlled enclosure itself:

```json
{
  "sceneId": "scene-008",
  "sequenceNumber": 8,
  "narrativePurpose": "establish",
  "focalSubject": "a small group of mice entering a controlled enclosure",
  "visibleAction": "gloved hands complete the placement of the mice into a transparent habitat",
  "environment": "sterile enclosure room with transparent walls, metal frame, bedding, water bottle, food tray, and clinical surfaces",
  "foreground": "clear acrylic wall, bedding, and one mouse near the front edge",
  "background": "blurred lab benches and fluorescent fixtures",
  "shotSize": "medium-wide",
  "cameraAngle": "high-angle",
  "composition": "centered enclosure-focused composition with the habitat dominating the frame",
  "lighting": "cool fluorescent lab light with soft reflections on acrylic",
  "timeOfDay": "indoor artificial light",
  "mood": "clinical tension",
  "distinctiveAnchor": "the transparent enclosure and the small group of mice inside it",
  "continuityElements": [
    "same research facility",
    "muted documentary realism",
    "no readable labels"
  ],
  "characters": [],
  "prohibitedElements": [
    "readable text",
    "logos",
    "watermarks",
    "gore",
    "fantasy distortion"
  ]
}
```

## Example Final Prompts

The pipeline converts the structured scene spec into a prompt with these sections:

1. image type and style;
2. primary visual event;
3. character identity and continuity;
4. environment;
5. camera and composition;
6. lighting and color;
7. distinctive scene anchor;
8. continuity requirements;
9. explicit differences from previous scene;
10. exclusions.

For `scene-007`, the final prompt starts like this:

```text
IMAGE TYPE AND STYLE:
Photorealistic cinematic documentary horror still, grounded realism, restrained color grading, 16:9.

PRIMARY VISUAL EVENT:
A researcher reviews repeated enclosure studies and archive materials, showing that Universe 25 was one of many related experiments.
```

For `scene-008`, the final prompt starts like this:

```text
IMAGE TYPE AND STYLE:
Photorealistic cinematic documentary horror still, grounded realism, restrained color grading, 16:9.

PRIMARY VISUAL EVENT:
A small group of mice is placed into a controlled enclosure, making the experiment concrete and immediate.
```

## Validation Rules

Prompts are rejected before any paid image call if they:

- use `shown` as the action;
- fail to identify a concrete visible subject;
- describe only a generic setting;
- rely on narration that is not visually representable;
- repeat the previous scene too closely;
- ask for recurring character continuity without an approved reference.

## Resumability

The pipeline writes manifests per scene and skips scenes that already have valid outputs. This makes it safe to rerun:

```bash
npm run images:generate -- --episode 001-calhoun-experiment
```

and then later rerun only one scene:

```bash
npm run images:generate -- --episode 001-calhoun-experiment --scene scene-008 --force
```

Cache reuse is split into explicit hash layers:

- `sceneHash` covers the source narration beat and scene planning fields.
- `visualPlanHash` covers the normalized visual plan, renderability, validation issues, and material differences.
- `promptHash` covers the rendered provider prompt text only.
- `providerRequestHash` covers the provider-affecting request payload: operation, model, size, quality, output format, prompt version, rendered prompt, and reference image checksums.
- `outputSha256` covers the generated image bytes.

Changing docs, timestamps, checkpoint text, or other diagnostics does not invalidate an image.
Changing concrete visual content invalidates the scene, visual-plan, prompt, and provider-request layers as appropriate.
Changing model, quality, size, output format, or reference image bytes invalidates `providerRequestHash` without pretending the rendered prompt changed.
Manifests without `providerRequestHash` regenerate once so older prompt-only caches cannot accidentally survive provider setting changes.
