# History V3.6 production-canary activation prep

Summary: added an exact two-episode V3.6 candidate routing seam with a V3.5 default and packaged Gate B evidence after measured TTS timing was blocked by required external-payload authorization. Global activation was not performed.

Changed paths: `packages/history/src/v36/production-canary-route-v36.ts`, its focused test and export, V3.6 boundary audit, canary evidence generator/output, and run journals.

Tests: History typecheck; targeted ESLint; 18 plan/compiler/renderer tests; 7 routing/plan tests; artifact checksums and ZIP integrity — all passed. The isolated timing request made zero completed provider calls.

Commit hash: `321fd6f6bce6eac462d3d0a5ac6a39636a22e7de` (timing-gate evidence checkpoint; routing commit `aada46d5da13c0f4c0ab8d34aaad986680198ef1`).

Unresolved risks: measured timing for both canaries needs explicit approval to send only their narration scripts to the configured OpenAI-compatible TTS provider, or supplied authoritative local timing artifacts.
