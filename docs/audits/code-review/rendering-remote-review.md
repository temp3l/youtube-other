# Rendering and Remote Rendering Audit

## FFmpeg Command Construction Risks

- Most FFmpeg calls use argument arrays through `runCommand`, which reduces shell injection risk.
- `packages/rendering/src/index.ts:4090` builds `-vf subtitles=${request.captionsPath}` without FFmpeg filter escaping.
- `packages/rendering/src/index.ts:2880` builds an rsync `-e` ssh command by joining args into a string; paths/options containing spaces need characterization and quoting rules.

## Timeline Mismatch Risks

- `packages/rendering/src/index.ts:2262` slices `narration.wav` during render if scene audio is missing.
- Render cache manifests hash image/audio paths, but a render-created audio segment can hide a missing upstream alignment failure.
- Full and short renders should validate total audio duration, scene timing, caption timing, and profile duration before invoking FFmpeg.

## Aspect-Ratio Handling Risks

- Full defaults to shared landscape images; short defaults to shared short portrait images.
- Tests cover 16:9 and 9:16 fixtures, but no single renderer input contract proves that source images, shot plans, caption layout, and final profile all agree.
- Short uploads prefer vertical video by filename scoring in `packages/youtube-upload/src/index.ts:815`, which should be replaced by manifest metadata.

## Motion Preset Integration Risks

- Motion options have focused tests and render manifest metadata.
- Before broad motion refactors, keep tests for deterministic seeds, preset IDs, and debug report writes.
- Motion debug cleanup should keep failure logs/manifests long enough for diagnosis.

## Remote Rendering Reliability Risks

- `scripts/remote-render-worker.mjs:229` parses job manifests without a schema.
- `scripts/remote-render-worker.mjs:63` and `:287` swallow malformed metadata reads into `null`/fallback behavior.
- `packages/rendering/src/index.ts:3385` parses remote results with an inline structural type.
- Remote fallback behavior needs tests for missing metadata, failed metadata, missing output, checksum mismatch, missing log, timeout, and partial result sets.

## Artifact Validation Gaps

- Local render validates output existence and media properties.
- Remote result validation should also include output hash, byte size, duration, dimensions, source dependency hashes, worker version, and command fingerprint.
- Upload should consume a render manifest rather than scanning `.mp4` candidates.

## Logging and Cleanup Gaps

- Remote worker writes stderr logs, but local retrieval/diagnostic guarantees are unclear for partial failures.
- Remote cleanup uses shell `find ... rm -rf`; base directory, cutoff, and job ID filters should be validated before use.
- Process telemetry must redact secrets before logging command arguments.

## Recommended Contract

Create a renderer input manifest containing episode, locale, variant, profile, image sources, audio sources, captions, expected durations, aspect ratio, hashes, motion config, and renderer mode. Local and remote renderers should consume the same validated contract.

