# ADR 008: Hardware encoding

Accepted. `libx264` is always supported and is the default. VA-API/QSV require encoder, render device,
short encode, and FFprobe verification before use. Merely appearing in `ffmpeg -encoders` is insufficient.
