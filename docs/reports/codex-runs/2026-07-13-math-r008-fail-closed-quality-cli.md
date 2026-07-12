# Math R-008 fail-closed quality and CLI

- Summary: implemented a single versioned required-gate contract with derived priority status, selected-locale assessment, separate render preflight/final-media readiness, strict publish permission, and schema/hash/lineage validation. Added content-hash-bound second-reviewer minor approval and workflow-owned CLI quality/status outcomes 0/1/2/3. R-008 is pending independent acceptance; R-009 was not started.
- Changed paths: `packages/math-education/src/orchestration/{quality-gate.ts,artifact-schemas.ts,pilot-simulation.ts,math-pipeline.unit.test.ts,quality-gate.unit.test.ts}`; `apps/cli/src/{math-commands.ts,math-commands.unit.test.ts}`; `docs/mathe/audits/remediation-backlog.md`; plan implementation report; this report.
- Checks: final quality unit 12/12 and CLI unit 6/6 passed. Filtered math-education/CLI typecheck passed before the final media-packet/publish-reader delta; the one-typecheck budget prevented a rerun.
- Commit: `ab9a32a7d880e3234b33f10b41e1a95917a195d3`; baseline `ac21261`; no commit.
- Risks/deviations: authoritative HEAD differed; final typecheck delta needs confirmation. No render integration, production render, broad checks/build, fixtures, generated/dist assets, provider/network, or publish was verified.
