# Provider Interfaces

MediaForge uses dependency inversion so provider implementations can be swapped without changing the domain or orchestration code.

## Key interfaces

- `SourceAdapter`
- `TranscriptionProvider`
- `TranscriptCleaner`
- `ScriptRewriter`
- `SpeechProvider`
- `VideoRenderer`
- `MetadataProvider`
- `ImageProvider`

## Current implementations

- Mock providers for local validation
- Local file source adapter
- Placeholder image generation
- FFmpeg renderer

## Planned providers

- Whisper.cpp transcription
- OpenAI-compatible text and TTS providers
- Documented API image providers

