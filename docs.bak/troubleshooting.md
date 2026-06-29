# Troubleshooting

## `doctor` reports missing tools

Install the missing dependency and rerun `pnpm run doctor`.

## `whisper.cpp` is missing

That is expected in this slice if you have not installed it yet. The doctor output will mark it as optional.

## FFmpeg render fails

Check the scene image paths, captions path, and that `ffmpeg` and `ffprobe` are installed.

## Render falls back to local audio slicing

If the renderer cannot find `audio/segments/scene-*.wav` files, it will now derive them from the existing episode narration WAV locally instead of forcing a new OpenAI TTS request. This keeps the render path offline and makes `mediaforge render` usable when narration is already present.

## Scene clips feel too long

The episode build uses the current `output/clips/scene-*.mp4` assets and trims trailing silence before concatenating the final export. If the full video still feels padded at the end of a scene, regenerate the clip set and rerun the concat step.

## Scene import finds no images

Verify that the files were copied into the inbox directory and that filenames match the workbook manifest.
