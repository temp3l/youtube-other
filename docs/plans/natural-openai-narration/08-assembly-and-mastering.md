# Assembly and Mastering

## Objective

Assemble validated chunks into natural narration and apply conservative mastering profiles.

## Current Evidence

- CLI and dark-truth paths use `ffmpeg -f concat -safe 0 -c copy`.
- Existing assembly consumes `segments.txt`, but no rich ordered manifest.
- Rendering consumes `audio/narration.wav` or locale-specific narration paths.

## Assembly Manifest

Use explicit ordered manifest entries:

```ts
interface NarrationAssemblyEntry {
  readonly chunkId: string;
  readonly sequence: number;
  readonly sourceAudioPath: string;
  readonly validationPath: string;
  readonly trimStartMs: number;
  readonly trimEndMs: number;
  readonly pauseBeforeMs: number;
  readonly pauseAfterMs: number;
  readonly crossfadeMs: number;
}
```

Never rely on filesystem ordering.

## Assembly Behavior

- Include only chunks whose validation status permits assembly.
- Preserve intentional pauses from performance directions.
- Trim excessive leading/trailing silence but retain configured minimum boundary silence.
- Use equal-power crossfades only when validation says both boundaries are non-speech.
- Insert silence where pauses are intentional.
- Detect missing, duplicated, or out-of-order chunks before FFmpeg execution.
- Write to temp output first, validate, then atomically promote.

## Mastering Profiles

Profiles:

- `clean-narration`
- `final-mix-narration`
- `shorts`
- `full`

Default chain:

```text
high-pass filtering
-> gentle EQ
-> light compression
-> optional de-essing
-> loudness normalization
-> true-peak limiting
```

Avoid saturation and heavy compression by default.

## Suggested Defaults

- WAV clean master for downstream render compatibility.
- 48 kHz final narration unless current render path requires preserving 24 kHz.
- Conservative loudness target around voice-first web narration, stored in config rather than hard-coded.
- True peak ceiling below clipping.

## Compatibility

Write:

- `audio/narration/clean-narration.wav`
- `audio/narration/mastered-narration.wav`
- compatibility copy or symlink-equivalent file at existing `audio/narration.wav` after success.

Cost impact: negligible.
