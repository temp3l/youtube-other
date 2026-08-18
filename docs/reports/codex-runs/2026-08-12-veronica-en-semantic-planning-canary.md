# Veronica EN semantic-planning canary

Changed: sentence-aware canonical source beats and planner v2.4; resolved-proposition density checks; unknown-action diversity identity; streaming-WAV duration parsing; dynamic HELD-reservation accounting; three current episode plans/timings and portfolio reports.

Result: provider-free preparation passed for 03B (7 scenes), 08B (7), and 02B (8). Source/audio hashes stayed current; corrected durations are 57.8/65.8/68.2 seconds. A €0.381283 03B QA reservation was released entirely because deterministic admission blocked before dispatch. New provider calls/cost: 0/$0/€0.

Checks: narration canary 2/2; resolver 9/9; visual beats/diversity 22/22; CLI typecheck; strategic/CLI builds; three production-preparation replays; 48-source recensus.

Risk: shared source-derived treatments leak doorway/public-threshold motifs and lack promise/experience mechanisms; 08B also retains one adjacent repetition. Test-repair budget is exhausted.

Follow-up: repair the shared semantic admission path, replay 03B first, then 08B/02B. Do not dispatch paid QA beforehand.

Commit: none; HEAD `492543b`.
