# ADR 006: Cache design

Accepted. Content-addressed scene directories contain MP4 plus versioned manifest/hash. Atomic rename,
stale locks, FFprobe/hash verification, hard-link reuse, and explicit status prevent partial cache hits.
Contracts reserve geometry/text/equation/theme layers for future independent materialization.
