# Dark Truth Pipeline Boundary

## Components to preserve

- CLI command families: `stories`, `episode`, `audio narration`, `images`, `render`, `metadata`, `youtube`, `thumbnails`, `shots`.
- Story generation/localization: `packages/story-localization/src/*`.
- Staged narration: `packages/speech/src/narration-*`, `dark-truth-adapter.ts`, script markdown parsing.
- Scene and visual planning: `packages/scene-planning`, `packages/visual-planning`, focal metadata helpers.
- Images: `packages/image-generation/src/episode-image-pipeline.ts`, batch services where used, shorts strategy.
- Rendering: `packages/rendering/src/index.ts`, local and remote render support.
- Metadata/upload: `packages/metadata`, `packages/youtube-upload`.
- Shared types/path/config: `packages/domain`, `packages/shared`, `packages/config`, `packages/persistence`.

## Pipeline-stage matrix

| Stage | Owner | Inputs | Outputs | Entry point | Persistence | Validation | Removal risk |
|---|---|---|---|---|---|---|---|
| Source discovery | `story-localization`, future resolver | episode slug, source root | source descriptor | `stories rewrite-full`, `stories rewrite-short` | `source/` artifacts | parse/hash checks | High: current searches include legacy paths |
| Full rewrite/localization | `story-localization.service.ts` | canonical English source, language | full story artifacts | `stories rewrite-full`, `stories localize` | `<lang>/full`, cache | schema/contract/repair | High: output paths conflict |
| Short adaptation | `short-rewrite.service.ts` | validated full story | short artifact | `stories rewrite-short` | `<lang>/short`, manifests | schema/contract/repair | Medium: parent lookup scattered |
| Production analysis | `story-production-analysis.*` | full story script | analysis JSON | `stories analyze` | `<lang>/full/story-production-analysis.json` | stale/current status | High: hard-codes `<lang>/full/script.md` |
| Narration setup | `speech` | resolved script | staged narration plan | `audio narration prepare/plan` | `locales/<locale>/<variant>/audio/narration` | local schemas | High: needs resolver |
| Narration generation | `speech` | chunks, voice config | audio chunks/master | `audio narration generate/assemble` | cache/chunks/wav | quality gate | Medium |
| Scene planning | `scene-planning`, CLI | narration/script | scene plan | `episode plan`, `images plan`, pipeline flows | `shared/scenes.json`, state | schema checks | High: multiple callers |
| Visual/shot planning | `visual-planning` | scenes, focal metadata | shot plan | `shots`, render prep | `state/visual-retention` | shot validation | Low if context preserved |
| Image generation/reuse | `image-generation` | scene plan, character refs | images/manifests | `images generate/resume` | `state/image-generation`, `shared/images` | manifest validation | Medium: legacy image fallback |
| Audio slicing/subtitles | `dark-truth`, `speech`, CLI | narration wav, speech plan | segments, srt/vtt | `episode`, `clips`, `audio` | `<variant>/audio`, subtitles | duration checks | High: duplicated |
| Rendering | `rendering` | scenes/images/audio/subtitles | clips/final mp4 | `render`, `episode` | renders/video dirs | ffmpeg/video validation | Medium |
| Metadata | `metadata` | validated narration/scenes | YouTube JSON | `metadata youtube` | metadata dirs | schema/cache | Low |
| Publishing | `youtube-upload` | video, metadata, thumbnail | upload report | `youtube upload` | upload state | API result | Low |

## Preservation rule

Do not remove any module until its active Dark Truth responsibility is covered by characterization tests and an application-level use case that consumes the central resolver.
