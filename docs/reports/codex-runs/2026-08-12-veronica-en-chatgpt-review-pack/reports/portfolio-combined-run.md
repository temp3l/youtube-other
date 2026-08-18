# Veronica English portfolio combined run

Terminal state: **PORTFOLIO_QA_COMPLETE**. Census: 48 sources / 2 packs / 0 duplicates. One eligible episode QA PASS; 36 lack audio/timing and 11 have stale provenance.

| Episode | Pack | Planning | Deterministic | Paid QA | Final state | New spend | Next action |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 01A | Pack 2 | ready | PASS | PASS | pre-image ready | $0.114284 | await image authorization |
| L02-S01 | v5 | deferred | stale provenance | — | deferred | $0 | renew source/audio/timing together |
| L02-S02 | v5 | deferred | stale provenance | — | deferred | $0 | renew source/audio/timing together |
| L05-S01 | v5 | deferred | stale provenance | — | deferred | $0 | renew source/audio/timing together |

QA: six `gpt-5.4-mini` requests, 22 misses, no retries/escalations; all 8 scenes, 13 beats, and sequence PASS. New $0.114284; aggregate $0.360672; $2.139328 remains below $2.50. TTS/image/thumbnail/render/publication: 0.

Systemic fixes: reviewed-beat ownership, grounded diversity, prompt hierarchy polarity, explicit malformed-cache retries, legacy materialization, incomplete locales, and fail-closed persistence. No images are authorized.
