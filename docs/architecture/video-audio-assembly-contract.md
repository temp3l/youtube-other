# Video Audio Assembly Contract

Final full and short renders use one continuous narration track as the only
audio authority. Scene and shot clips are rendered as video-only MP4 segments,
then concatenated with the FFmpeg concat demuxer using stream copy. The final
mux maps video from the visual concat and audio from the continuous narration
file.

Expected final audio normalization:

- Codec: AAC
- Sample rate: 48000 Hz
- Channels: 2
- Filter: `aresample=48000:async=1:first_pts=0`

The renderer must not encode AAC audio into every clip and then concat-copy
those clip audio streams. Per-clip AAC introduces encoder delay and boundary
artifacts. The renderer also must not add synthetic clip-boundary silence or
strip silence from the continuous narration track; pauses that exist inside the
narration file remain part of the final episode.

Scene clips, shot clips, and the intermediate visual concat are validated as
video-only artifacts. Cached clips that still contain embedded audio are
rejected and rerendered before final mux.

Each render manifest records `audioAssembly` diagnostics with per-clip expected
duration, actual video duration, source audio duration when available, drift,
total visual timeline drift, final narration duration, and warning/failure
thresholds. Use these diagnostics when investigating glitches:

1. Inspect `render.json` and check `audioAssembly.warnings`.
2. Confirm final `validation.audioSampleRateHz` is `48000` and
   `validation.audioChannels` is `2`.
3. Check clips with drift above the warning threshold for bad source audio,
   frame-rate rounding, or stale cached clips.
4. If drift exceeds the configured failure threshold, rerender clips after
   fixing the owning source media rather than padding the boundary.
