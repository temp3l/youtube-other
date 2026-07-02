# Audio Validation and Continuity

## Objective

Validate every generated chunk locally and prepare continuity metadata before assembly.

## Current Evidence

- `packages/speech/src/index.ts` validates WAV metadata and basic quality inside the provider.
- `apps/cli/src/index.ts` has `inspectAudioDurationSeconds` using `ffprobe`.
- Current validation is hard-fail and does not persist per-chunk reports.

## Validation Checks

For each chunk:

- file exists;
- file is decodable by FFprobe;
- duration is greater than zero;
- duration is plausible for language-aware WPM;
- sample rate and channel count match profile;
- container and codec are expected;
- silence percentage is within bounds;
- leading and trailing silence are within configured ranges;
- peak and RMS are plausible;
- clipping ratio is below threshold;
- true peak is below threshold when available;
- file size is non-zero;
- output is not unexpectedly short or long.

## Classification

Each finding is:

- `error`: blocks assembly;
- `warning`: allows assembly but affects quality gate;
- `info`: recorded for inspection.

Duration deviation should usually be warning unless extreme.

## Continuity Metrics

Record:

- measured duration;
- retained leading silence;
- retained trailing silence;
- suggested trim start/end;
- safe crossfade eligibility;
- boundary pause target from direction;
- loudness estimate;
- peak/RMS.

## Artifact

`chunks/<chunk-id>.validation.json`:

```ts
interface ChunkValidationReport {
  readonly schemaVersion: "narration-chunk-validation-v1";
  readonly chunkId: string;
  readonly audioPath: string;
  readonly status: "passed" | "passed-with-warnings" | "failed";
  readonly findings: readonly AudioValidationFinding[];
  readonly metrics: AudioValidationMetrics;
  readonly validatedAt: string;
}
```

## Cost Impact

Negligible. Local FFmpeg/FFprobe only.
