# History V3.6 production-canary activation prep

Summary: added exact two-episode V3.6 candidate routing with a V3.5 default, generated measured canary TTS audio after approval, and packaged Gate B evidence because both outputs miss the configured 480-second production minimum. Global activation was not performed.

Changed paths: `packages/history/src/v36/production-canary-route-v36.ts`, its focused test and export, V3.6 boundary audit, canary evidence generator/output, and run journals.

Tests: History typecheck; targeted ESLint; 25 focused tests; isolated OpenAI-compatible TTS; ffprobe duration checks; artifact checksums and ZIP integrity — passed. Candidate-plan admission correctly failed on duration policy.

Commit hash: pending final measured-duration gate checkpoint (prior evidence `321fd6f6bce6eac462d3d0a5ac6a39636a22e7de`; routing `aada46d5da13c0f4c0ab8d34aaad986680198ef1`).

Unresolved risks: Black Death is 399.857s and D-Day 367.634s, below the 480s minimum. A human must authorize a script/pacing or duration-policy change; none is implied by canary approval.
