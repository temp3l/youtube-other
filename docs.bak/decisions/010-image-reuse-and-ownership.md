# ADR 010: Image reuse and ownership

## Status

Accepted

## Decision

Generated scene images are episode-owned canonical assets. The canonical full-scene image location is:

```text
episodes/<episode-id>/shared/images/generated/
```

Character reference images are also episode-owned canonical assets:

```text
episodes/<episode-id>/shared/images/character-references/
```

Image-generation state under `state/image-generation/` owns auditability and resumability records only. It does not own final scene-image binaries except for legacy compatibility reads from `state/image-generation/images/`.

## Reuse Policy

Full videos, localized videos, and Shorts may reuse canonical scene images when the visual beat is materially the same and the image does not contain locale-specific readable text.

Reuse is not allowed when:

- a scene has required readable text that differs by locale or variant;
- a localized script introduces a visible locale-specific object, setting, sign, document, or on-screen text requirement;
- a Shorts opening scene is intentionally regenerated as a native vertical hook;
- the provider request hash changes because model, size, quality, output format, rendered prompt, or reference image checksum changed;
- the visual plan hash changes because concrete visual content or renderability changed.

## Implementation Constraints

- Full-scene image generation writes canonical images through the shared image path resolver.
- Rendering resolves images through canonical candidates first and legacy state candidates only as migration fallback.
- Scene manifests persist `outputPath`, `outputSha256`, `promptHash`, `providerRequestHash`, `visualPlanHash`, and optional `reusedFromSceneId`.
- `mergeWithPrevious`, `mergeWithNext`, and cached reuse decisions are persisted in manifests and checkpoint records.
- Shorts image preparation may reuse landscape images for tail scenes, but native vertical hook scenes can be regenerated into the Shorts output directory with a separate Shorts manifest.
- Character references are episode-specific identity inputs. They are shared across full, localized, and Shorts generation for the same episode, but they are not global cross-episode assets.

## Repository Evidence

- `packages/shared/src/episode-filesystem.ts` defines canonical generated-image and character-reference paths plus legacy fallback paths.
- `packages/image-generation/src/episode-image-pipeline.ts` persists reuse decisions with `reusedFromSceneId`, renderability, provider request hashes, checkpoints, and failure records.
- `packages/image-generation/src/shorts-image-strategy.ts` implements Shorts hook regeneration and landscape reuse policy.
- `packages/rendering/src/index.ts` resolves scene images through canonical and legacy candidate paths before composition.
- `packages/pipeline/src/index.ts` and `packages/dark-truth/src/index.ts` write placeholder scene images to the canonical shared generated-image path.

## Consequences

- Cleanup tools must treat `shared/images/generated/`, `shared/images/character-references/`, and `shared/characters.json` as durable assets.
- Locale-specific image regeneration should be explicit and driven by changed visual/text requirements, not by localization alone.
- Retry and resume flows may delete or rewrite state records, but must not casually delete canonical shared images.
- Legacy state image paths remain readable during migration, but new writers should not create final scene images there.
