# History V3.6 production-canary activation prep

Summary: changed the History-only measured production minimum to 300 seconds, reused approved canary audio, and passed isolated V3.6 plans, SVG/PNG rendering, FFmpeg smoke, semantic checks, differential, and rollback routing. Global activation was not performed.

Changed paths: History duration policy/test/docs, V3.6 diagram renderer/test, isolated canary runner/output, and run journals.

Tests: focused duration-policy and renderer/plan tests; History typecheck; targeted ESLint; ffprobe timing; renderer review; FFmpeg smoke; checksums; ZIP integrity; V3.5 isolation — passed.

Commit hash: pending bounded-rollout checkpoint (policy `5dda628f37b08149c95ac83f3a19d84d29c77249`).

Unresolved risks: the general V3.5 production composer remains intentionally unchanged; V3.6 is ready only through the explicit isolated canary runner and allowlist.
