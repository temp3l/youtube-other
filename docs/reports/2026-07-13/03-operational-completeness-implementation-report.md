# Operational completeness implementation report

- Source plan: `docs/plans/linux-math-renderer/03-operational-completeness.md`
- Date: 2026-07-13

## Summary

Capability inspection now detects tools separately and self-tests libx264 plus eligible VA-API/QSV encoders with a bounded H.264 encode and FFprobe. Linux renderer-process-tree RSS is measured from `/proc`; benchmark output must be a fresh OS-temp directory and optional encoder skips retain exact reasons.

## Files and tasks

Changed contracts, media/process/FFmpeg/renderer internals, README/ADR/checklist, and focused tests. Completed: capability truthfulness, hardware adapter coverage, RSS collection, fresh benchmark root, real preview benchmark. Partial: temporary occupancy/cumulative-write metric is deliberately omitted (unmeasured); no dedicated soak/cancellation integration or cold full/portrait run completed. No app/pipeline integration.

## Evidence

Host: libx264 self-test available; VA-API/QSV listed but unavailable (no `/dev/dri/render*`), so real hardware is not measured. Benchmark preview: cold 10523ms, warm 1527ms, 496672 bytes, RSS 83353600 bytes; FFprobe: H.264, 960x540, yuv420p, 15fps, 38s. Optional runs skipped with the device reason.

## Checks and risks

Focused capability and process/architecture tests passed. Build and real integration/package-smoke passed; packed consumer failed only with `ERR_PNPM_EROFS` writing the configured pnpm store. Typecheck, lint, frozen offline install, and diff check passed. Complete soak/full/portrait acceptance and writable-store packed-consumer rerun next.
