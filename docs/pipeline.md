# Pipeline

The pipeline is implemented as a versioned sequence of idempotent stages.

## Current stages

1. inspect-source
2. acquire-transcript
3. extract-or-normalize-audio
4. transcribe-source-if-needed
5. clean-transcript
6. rewrite-script
7. extract-and-check-claims
8. plan-scenes
9. synthesize-scene-audio
10. concatenate-audio
11. align-final-audio
12. reconcile-canonical-caption-text
13. create-captions
14. create-image-prompts
15. export-openart-batches
16. import-image-assets
17. validate-image-assets
18. generate-publishing-metadata
19. render-video
20. validate-output
21. package-results

## Current vertical slice

The first implementation focuses on local files and a mock media workflow:

- source media is copied into the episode workspace
- a transcript can be supplied as a sidecar JSON file
- transcript cleanup and rewriting are conservative
- scene planning is one-to-one with transcript segments
- mock TTS generates scene-level WAV files
- placeholder images allow rendering without an external image provider
- FFmpeg assembles the final MP4
- ffprobe validates the container

## Idempotency

Each stage is intended to be repeatable. The manifest records the outputs and acts as the canonical checkpoint for resume logic and later caching work.
