Summary: Fixed a `@mediaforge/rendering` type error by comparing filesystem-derived clip/manifests IDs against `Set<string>` instead of a branded `SceneId` set.
Changed paths: `packages/rendering/src/index.ts`
Tests: `pnpm --filter @mediaforge/rendering typecheck`
Commit hash: `9e3ba73`
Unresolved risks: This fixes the compile-time mismatch only. Filesystem IDs are still treated as raw strings in this validation path, so malformed filenames are reported as unexpected artifacts rather than parsed into branded scene IDs.
