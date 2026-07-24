# M2-009 paid speech attempt

Summary: `BLOCKED_NOT_ACCEPTED` (`COST_CEILING`). M5-ZO-001 made two approved speech calls before TTS stopped: 1,577 characters, 82.35 generated seconds, estimated USD 0.025652. Chunk one passed with a duration warning; chunk two was rejected at 424 WPM. No M5-GM-002 or M5-DZ-001 call, render, upload, OAuth, publish, or remote mutation ran.

Changed paths: `packages/speech/src/educational-speech-{pipeline,unit.test}.ts`, `apps/cli/src/math-{workflow-runtime,workflow-runtime.unit.test,commands}.ts`, and this report.

Tests: educational speech passed 11/11; math runtime passed 5/5. Speech and CLI builds passed.

Commit: base `0da58fc`; implementation pending commit.

Unresolved risk: the initial calls used stale speech `dist`; rebuilt runtime correctly invalidated the otherwise usable first chunk. Validation retries now run inside the bounded loop, and sanitized paid-call logs enforce cumulative cost. A fresh cumulative worst-case is USD 0.250598, exceeding the approved USD 0.225 M5-ZO-001 ceiling. Continuing requires a revised M5-ZO-001 ceiling of at least USD 0.250598 and a revised aggregate ceiling of at least USD 0.700598.
