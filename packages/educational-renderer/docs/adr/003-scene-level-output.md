# ADR 003: Scene-level output

Accepted. Every scene becomes an independently verified normalized MP4. This makes failure isolation,
resume, changed-only rendering, and final concat predictable; successful outputs are never rolled back.
