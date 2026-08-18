# Three-Short narration canary

Implemented a creator-authorization-aware, source-bound Veronica narration canary with one provider call per episode, hard USD/EUR ceilings, resumable candidate reuse, durable reservation reconciliation, and atomic selected-audio/timing provenance.

Changed: `apps/cli/src/veronica-narration-canary.ts`, its focused test, Veronica command registration, recensus logic, three new episode workspaces/artifact chains, authorization/reservation records, and current portfolio reports.

Result: 3/3 PASS; TTS calls 3, retries/cache hits 0. Durations/WPM: 03b 57.8s/175.4 (soft-high), 08b 65.8s/157.8, 02b 68.2s/154.0. Audio/timing hashes match every current source. Canary cost $0.047950 / €0.045706; cumulative €2.373764; remaining €2.509252; held €0.

Checks: focused Vitest 2/2; CLI typecheck/build; source/audio/timing hash checks; 48-source recensus PASS.

Risk/follow-up: 03b pacing is acceptable but above preference. Next run is provider-free visual planning/admission for the same three episodes. No paid QA/images/render/publication authorized.

Commit: none; HEAD `492543b`.
