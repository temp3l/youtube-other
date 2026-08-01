# Strategic Reinvention Task 01

Summary: Added Italian and Strategic Reinvention domain/path contracts. Full supplied v1 source/blueprint imports preserve documented fields and spellings, normalize only to strict v1.1 targets, and retain fail-closed rights checks. Supported regional locales normalize to their base locale; unsupported or colliding forms fail closed. Strategic resolver IDs reject traversal.

Changed paths: `packages/domain/src/content-policy-contracts.ts`, `packages/domain/src/content-policy-contracts.unit.test.ts`, `packages/domain/src/index.ts`, `packages/domain/src/workflow-contracts.ts`, `packages/domain/src/workflow-contracts.unit.test.ts`, `packages/domain/src/shared-visuals.unit.test.ts`, `packages/shared/src/episode-filesystem.ts`, `packages/shared/src/episode-filesystem.unit.test.ts`, `packages/shared/src/artifact-path-resolver.ts`, `packages/shared/src/artifact-path-resolver.unit.test.ts`, this report.

Tests: workflow contracts (10/10); artifact resolver (5/5); content-policy contracts (4/4); episode filesystem (27/27); shared visuals (3/3); targeted domain build and final `pnpm --filter @mediaforge/domain typecheck` passed (one TypeScript repair retry).

Commit: `d61a924` (`feat(domain): add Italian strategic content contracts`).

Unresolved risks: no paid, external, upload, publication, synthetic-media, or broad validation action was performed. The targeted domain build refreshed stale package exports before shared-path verification.
