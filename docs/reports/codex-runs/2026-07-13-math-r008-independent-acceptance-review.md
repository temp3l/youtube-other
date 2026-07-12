# Math R-008 independent acceptance review

- Decision: reject R-008 on 2026-07-13; keep pending repair and do not start R-009.
- Summary: strict v2 gate derivation, priority, locale scope, media blocking, bound minor approval, dry-run-only publish surface, and focused checks passed. Material attack: `readAuthoritativeStageArtifact` validates a stage record against its own declared parents, while `authoritativeQuality` never compares `report.lessonId` with the requested/manifest lesson. Swapping a valid `READY` quality artifact and quality-stage record across manifests can therefore authorize the wrong target. Publish packets likewise lack embedded lesson/language binding to the request. A blocked publish sets exit `3`, throws, and the top-level CLI catch resets it to `1`.
- Changed paths: `docs/mathe/audits/remediation-backlog.md`; `docs/reports/2026-07-12/math-genre-implementation-plan-implementation-report.md`; `docs/reports/codex-runs/2026-07-13-math-r008-independent-acceptance-review.md`.
- Checks: quality unit 12/12 passed; CLI unit 6/6 passed; math-education and CLI typecheck passed.
- Commit: `ab9a32a7d880e3234b33f10b41e1a95917a195d3`; baseline `ac21261`; no commit.
- Risks/follow-up: owning modules are `workflow.ts`, `math-commands.ts`, and top-level `index.ts`. Bind cross-stage ancestry and requested artifact identity, preserve exit `3`, and add adversarial/process-level tests. No render/broad/provider/network/publish/generated-asset verification.
