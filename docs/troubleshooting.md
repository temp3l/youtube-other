# Troubleshooting

## `doctor` reports missing tools

Install the missing dependency and rerun `pnpm run doctor`.

## `whisper.cpp` is missing

That is expected in this slice if you have not installed it yet. The doctor output will mark it as optional.

## FFmpeg render fails

Check the scene image paths, captions path, and that `ffmpeg` and `ffprobe` are installed.

## Scene import finds no images

Verify that the files were copied into the inbox directory and that filenames match the workbook manifest.
