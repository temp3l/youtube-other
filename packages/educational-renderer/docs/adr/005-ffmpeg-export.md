# ADR 005: FFmpeg export

Accepted. Prefer scene segments/hybrid still expansion over PNG/JPEG/WebP sequences or raw pipes. It
minimizes disk writes and gives crash recovery at scene granularity. Diagnostic SVG preservation is
available with `keepTemporaryFiles`; raw piping remains a future benchmark candidate for animation.
