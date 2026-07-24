# M2-010A six-step implementation

Status: `BLOCKED_ENVIRONMENT`. HEAD `934a40f`; dirty worktree preserved; no commit. M2-009 remains unaccepted: all three bound media records fail the current schema (`INVALID_ARTIFACT`), contain fixture-tone audio, and predate narration/chalk versions.

Release `de-gems-5-10-v1`, hash `9afb5e2c…60b31`; order: M5-ZO-001,002,003,004,005,006,007,008,009,010,011,012,013,014,015,016,017,018,019,020,021,022,023,024; M5-GM-001,002,003; M5-RF-001,002,003,004,005,006; M5-GM-004,005; M5-DZ-001,002. First: M5-ZO-001 (stable topological/seed order), prerequisites none. Lesson `e629c5cc…c21e`; narration `1ed499af…bb20`; review `39cf1f0c…ba91`; attestation `5abffd11…8519`.

Preflight command: `math production plan --canonical-first … --paid-speech --max-provider-cost-usd 0.30`. Workspace `/tmp/m2-010a-private-single-20260715`; 1 item, 16 misses, 7 planned calls, 4,970 characters, 240s, conservative USD 0.224946; other 36: zero calls/mutations. No execution/artifacts/cost; privacy mutations zero.

Changed: CLI speech operator; locked-facts.v3 narration/review; semantic-chalk.v2 renderer; canonical evidence gates. Checks: localization 11/11, chalk 1/1, runtime 4/4; CLI/math/rendering builds passed. Credential presence checked without disclosure. Required next: separately accept M2-009, then provide fresh one-lesson approval at ceiling ≥USD 0.224946.
