# ADR 008: Hardware encoding

Accepted. `libx264` is the default. Capability inspection separately detects tools and then runs a
bounded 64x64/0.2-second encode plus FFprobe verification. VA-API/QSV require an encoder listing, an
accessible render device, a successful device encode, and H.264/64x64/yuv420p/duration verification.
Failures are JSON-safe `failed-self-test`; absent devices are `unavailable`. Hardware remains opt-in.
