# Repair natural chalk and math pipeline

Changed: math chalk/composition/encoding sources and tests; narration preset,
workflow invalidation, complete production contracts and tests; math CLI
fixture command; media/CLI/refactor docs; generated AI context; audit above.

Checks: focused chalk tests passed (9/9). Narration, invalidation, and complete
pipeline tests passed (13/13). Math-education and math-rendering typechecks
passed. Targeted ESLint passed. Math-rendering build passed. CLI fixture test
passed; the full CLI file then reached the known stale synthetic curriculum
fixture and failed `runs and resumes explicit simulation...` with “Localized
topic evidence is missing from the opening beat.” CLI typecheck is separately
blocked by the pre-existing dirty `story-analysis-command.ts:77` optional
property error. AI pack build passed.

Generated review: `.cache/math-pipeline/natural-chalk-fixtures/` (8 fixture
pairs and contact sheet).

Risks: no full v5 MP4, Short/PDF materializer, concrete distribution provider,
live upload, remote verification, or scheduling E2E was run. No paid/network or
publication action occurred.

Commit: uncommitted; base `f29a43c2eef25f185b60a20c4e56ea4598279115`.
