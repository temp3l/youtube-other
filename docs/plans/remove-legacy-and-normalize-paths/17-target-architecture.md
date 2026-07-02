# Target Architecture

## Final repository shape

```mermaid
flowchart TD
  CLI[apps/cli]
  API[apps/api]
  UseCases[Dark Truth application use cases]
  Resolver[central script resolver]
  Story[story localization]
  Speech[staged narration]
  Scene[scene and visual planning]
  Images[image generation]
  Render[rendering]
  Metadata[metadata]
  Upload[youtube upload]
  Shared[domain/shared/config/observability]
  FS[(canonical episode workspace)]
  External[OpenAI / ffmpeg / remote render / YouTube]

  CLI --> UseCases
  API --> UseCases
  UseCases --> Resolver
  UseCases --> Story
  UseCases --> Speech
  UseCases --> Scene
  UseCases --> Images
  UseCases --> Render
  UseCases --> Metadata
  UseCases --> Upload
  Resolver --> Shared
  Story --> Shared
  Speech --> Shared
  Scene --> Shared
  Images --> Shared
  Render --> Shared
  Metadata --> Shared
  Upload --> Shared
  Shared --> FS
  Story --> External
  Speech --> External
  Images --> External
  Render --> External
  Metadata --> External
  Upload --> External
```

## Canonical script flow

```mermaid
flowchart LR
  Request[episode language variant] --> Resolver
  Resolver --> Canonical[languages/script-lang or languages/short/script-lang]
  Resolver --> Hash[content hash and cache identity]
  Hash --> UseCase[application command]
  UseCase --> Stage[story/audio/scene/image/render/publish stage]
```

## Removed

- `@mediaforge/pipeline` package and imports.
- Root legacy CLI flow, unless replaced by aliases to active use cases during transition.
- `apps/api` dependency on pipeline.
- Root `script.md` and `<language>/<variant>/script.md` as authored script sources.
- Legacy narration mode after staged narration is the only production mode.
- Legacy image/audio/transcript path fallbacks after migration.

## Preserved

- Full-video and Short Dark Truth pipelines.
- Sync and batch image strategies when active.
- Local, remote, and hybrid rendering.
- Staged narration cache and quality gates.
- Metadata generation and YouTube upload.
- Historical generated artifacts unless explicitly cleaned operationally.
