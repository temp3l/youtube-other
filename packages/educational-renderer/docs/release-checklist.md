# Release checklist

- Install Node 22+, pnpm 10, FFmpeg/FFprobe, librsvg, AAC, and DejaVu Sans.
- Build, then install the packed private package in a clean consumer.
- Run `educational-renderer inspect --json`; use only encoders reported `available`.
- Preview render with a contained visual plan; inspect `final/lesson.mp4` with FFprobe.
- Use `cache inspect` and `cache clean --corrupt-only`; existing output scene hard links survive cleaning.
- Interrupt a render safely and rerun it: validated promoted scenes resume from cache.
- For disk, font, or tool failures, resolve the reported typed error and rerun; do not delete live locks.
- Roll back by removing this private package/workspace registration only; it has no app or pipeline integration.
