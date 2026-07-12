# ADR 004: Static-scene strategy

Accepted. Store one SVG and let FFmpeg expand it directly for the requested duration. Audio timing uses
the segment duration; output frame rate is explicitly normalized. Transition metadata is keyed but v0.1
uses hard boundaries, with animated segments reserved as another manifest representation.
