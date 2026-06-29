# ADR 009: Image artifact layout

## Status

Accepted

## Decision

Use this image artifact layout for episode workspaces:

```text
episodes/<episode-id>/
  shared/
    characters.json
    images/
      character-references/
      generated/
  state/
    image-generation/
      manifests/
      prompts/
      visual-plans/
      provider-requests/
      provider-responses/
      checkpoints/
      failures/
      images/                  # legacy compatibility path only
```

### Ownership

- `shared/images/generated/`
  - canonical generated scene-image assets;
  - reusable by downstream rendering;
  - durable across reruns unless explicitly regenerated.

- `shared/images/character-references/`
  - canonical recurring-character identity references for the episode.

- `state/image-generation/`
  - resumability state, prompt artifacts, visual plans, provider request/response audit records, checkpoints, and failure records;
  - not the canonical home for final generated scene-image binaries.

- `state/image-generation/images/`
  - read-compatible migration path for legacy outputs only;
  - not a canonical write target.

### Explicit answers

- Are generated scene images language-independent?
  - Yes, by default. Scene images are episode-level assets unless a scene explicitly requires readable localized text.

- Can full and short variants reuse the same scene image?
  - Yes. Full and short outputs may reuse the same canonical scene image when the visual beat is the same.

- Can localized versions reuse the same image when no visible text is present?
  - Yes. Reuse is the default when no visible localized text or locale-specific visual requirement exists.

- Are images canonical assets or merely intermediate execution outputs?
  - Canonical assets. They are consumed by downstream rendering and should live under `shared/`, not only under `state/`.

- Should `state/` contain final binary images or only metadata and resumability records?
  - Only metadata and resumability records, except for temporary migration compatibility with legacy `state/image-generation/images/`.

- Which paths are safe to delete and regenerate?
  - `state/image-generation/prompts/`
  - `state/image-generation/visual-plans/`
  - `state/image-generation/provider-requests/`
  - `state/image-generation/provider-responses/`
  - `state/image-generation/checkpoints/`
  - `state/image-generation/failures/`
  - legacy `state/image-generation/images/` after migration is complete and canonical shared images exist

- Which paths are not safe to delete casually?
  - `shared/images/generated/`
  - `shared/images/character-references/`
  - `shared/characters.json`

- Which paths are consumed by downstream video composition?
  - `shared/images/generated/`
  - `shared/images/character-references/` indirectly through generation, not direct rendering

- Which paths are included in manifests?
  - scene manifests may reference canonical generated images under `shared/images/generated/`;
  - state manifests may reference state artifacts under `state/image-generation/`;
  - legacy state-image references remain readable during migration only.

- How should legacy paths be migrated without breaking resume behavior?
  - keep compatibility readers for legacy state-image paths;
  - hydrate or copy canonical shared images from legacy paths when needed;
  - stop writing new canonical outputs to the legacy path.

- Is a compatibility resolver required during migration?
  - Yes. The shared resolver must expose canonical paths and explicit legacy fallback paths until migration is complete.

### Deletion policy

- Canonical scene images in `shared/images/generated/` are durable assets and should only be removed by explicit cleanup or regeneration workflows.
- Character references in `shared/images/character-references/` are durable identity inputs and should not be removed by ordinary resume or retry flows.
- State records in `state/image-generation/` are regenerable unless needed for audit or troubleshooting retention.

### Downstream implications

- Rendering must resolve canonical scene images from `shared/images/generated/`.
- Image generation may read legacy `state/image-generation/images/` only through an explicit compatibility path resolver.
- No new code should treat `state/image-generation/images/` as the canonical output directory.

## Rationale

The current pipeline already writes canonical scene images to `shared/images/generated/` and hydrates from legacy state paths during migration. That direction is correct because generated scene images are:

- shared across rendering steps;
- commonly reusable across full and short outputs;
- often reusable across locales when no readable localized text is present;
- more durable than prompt/state artifacts.

Keeping final scene-image binaries under `state/` would blur the line between:

- canonical reusable episode assets;
- resumable execution state.

That would make downstream rendering, cleanup policy, and migration rules harder to reason about.

## Consequences

- the shared path resolver must become the single source of truth for canonical and legacy image paths;
- image services must stop constructing canonical image paths locally;
- manifests should persist canonical shared image output paths, not legacy state image paths, for newly generated scenes;
- migration support remains necessary until old episodes have been normalized.
