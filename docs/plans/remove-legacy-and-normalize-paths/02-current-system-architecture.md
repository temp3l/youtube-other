# Current System Architecture

## Repository-level architecture

```mermaid
flowchart TD
  CLI[apps/cli primary operator surface]
  API[apps/api minimal HTTP wrapper]
  WEB[apps/web static surface]
  Story[@mediaforge/story-localization]
  Speech[@mediaforge/speech]
  Images[@mediaforge/image-generation]
  Render[@mediaforge/rendering]
  Metadata[@mediaforge/metadata]
  Upload[@mediaforge/youtube-upload]
  Pipeline[@mediaforge/pipeline legacy orchestration]
  DarkTruth[@mediaforge/dark-truth overlapping episode orchestration]
  Shared[@mediaforge/shared/domain/config/persistence]
  FS[(episode workspace filesystem)]
  DB[(SQLite manifests/runs/steps)]
  External[OpenAI / ffmpeg / remote render / YouTube]

  CLI --> Story
  CLI --> Speech
  CLI --> Images
  CLI --> Render
  CLI --> Metadata
  CLI --> Upload
  CLI --> Pipeline
  CLI --> DarkTruth
  API --> Pipeline
  WEB --> Shared
  Story --> Shared
  Speech --> Shared
  Images --> Shared
  Render --> Shared
  Metadata --> Shared
  Upload --> Shared
  Pipeline --> Shared
  DarkTruth --> Shared
  Shared --> FS
  Shared --> DB
  Story --> External
  Speech --> External
  Images --> External
  Render --> External
  Metadata --> External
  Upload --> External
```

## Dark Truth and legacy coexistence

```mermaid
flowchart LR
  subgraph Active["Active Dark Truth / story production"]
    A1[stories rewrite-full/localize/rewrite-short]
    A2[stories pipeline/analyze]
    A3[audio narration staged pipeline]
    A4[images plan/generate/resume]
    A5[render/metadata/youtube upload]
  end
  subgraph Legacy["Legacy and overlapping orchestration"]
    L1[mediaforge create/run/status/inspect]
    L2[apps/api createPipeline health wrapper]
    L3[dark-truth episode commands]
    L4[legacy narration mode default]
  end
  SharedPath[shared path/config/domain packages]
  A1 --> SharedPath
  A2 --> SharedPath
  A3 --> SharedPath
  A4 --> SharedPath
  A5 --> SharedPath
  L1 --> SharedPath
  L2 --> SharedPath
  L3 --> SharedPath
  L4 --> SharedPath
```

## Full-video pipeline

```mermaid
flowchart TD
  Source[canonical story source] --> Rewrite[English full rewrite or localization]
  Rewrite --> Resolver[current scattered script paths]
  Resolver --> Analysis[story production analysis]
  Analysis --> Scenes[scene planning]
  Scenes --> Visual[visual / shot planning]
  Visual --> Images[image generation or reuse]
  Rewrite --> Narration[narration preparation and TTS]
  Narration --> Timing[audio timing / slicing / subtitles]
  Images --> Render[16:9 render]
  Timing --> Render
  Render --> Validate[render validation]
  Validate --> Publish[metadata and YouTube upload]
```

## Short pipeline

```mermaid
flowchart TD
  Full[validated full story] --> ShortRewrite[short adaptation]
  ShortRewrite --> Resolver[current scattered script paths]
  Resolver --> ShortAnalysis[short analysis / event planning]
  ShortAnalysis --> Shots[visual-retention shot planning]
  Shots --> Images[image generation or reuse]
  ShortRewrite --> Narration[short narration]
  Narration --> Timing[timing and subtitles]
  Images --> VerticalRender[9:16 render]
  Timing --> VerticalRender
  VerticalRender --> Validate[validation]
  Validate --> Publish[metadata and YouTube Shorts upload]
```

## Storage and queue boundaries

```mermaid
flowchart LR
  CLI[CLI commands] --> FS[(episode workspaces)]
  CLI --> DB[(SQLite)]
  CLI --> Remote[(remote render workspace)]
  CLI --> APIs[OpenAI and YouTube]
  FS --> Cache[local cache/manifests/state]
  Queue[Queue framework]:::absent
  Worker[Durable worker framework]:::absent
  classDef absent fill:#eee,stroke:#888,color:#555;
```

No BullMQ, durable workflow server, Kubernetes, Terraform, or root GitHub Actions wiring was found in the inspected source tree. Treat queue/workflow items as absent unless later implementation finds deployment-only wiring outside this workspace.
