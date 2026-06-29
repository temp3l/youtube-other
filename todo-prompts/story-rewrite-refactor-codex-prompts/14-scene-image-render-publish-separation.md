# Task: Scene, Image, Render, And Publish Separation

Split visual planning, images, rendering, thumbnails, and publication from narration for full and short variants.

## Objective

Make downstream media stages explicit artifact owners and preserve existing CLI commands.

## Required Stages

Cover:

- scene planning for full video;
- short scene planning or short beat-to-scene planning;
- image prompt generation;
- landscape image generation/reuse;
- vertical short image strategy;
- full render with `youtube` profile;
- short render with `vertical` profile;
- thumbnails;
- upload metadata;
- YouTube upload.

## Requirements

- Scene/image/render/publish stages must depend on validated narration plus relevant metadata/audio/transcripts, not on prompt diagnostics.
- Short vertical requirements must be explicit: 9:16, short duration, short scene count, safe text placement, and parent full-video linkage.
- Renderer changes invalidate rendered media only.
- Scene planner changes invalidate scene and visual artifacts only.
- Thumbnail changes do not invalidate narration.

## Tests

Add tests or dry-run assertions for:

- full and short render paths;
- vertical profile selection for shorts;
- short image manifest parent linkage;
- thumbnail lookup does not decide narration validity;
- upload metadata by variant.

## Acceptance Criteria

- Downstream media stages are independent from narration generation.
- Full and short media workflows are explicit.
- Existing commands remain externally compatible.
