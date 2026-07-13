# Recommended next prompt: implement R-009 metadata, thumbnail, playlists, and safe publish dry run

```text
Continue from the current worktree. Read AGENTS.md,
docs/ai-context/context-pack.md,
docs/mathe/audits/remediation-backlog.md,
docs/mathe/audits/post-implementation-verification.md (F-009 only),
docs/mathe/plans/math-genre-implementation-plan.md (sections 8-12 only),
docs/mathe/plans/math-genre-test-matrix.md (M01-M04, P01-P06, D01, D03,
D05, and H03-H04 only),
docs/reports/codex-runs/2026-07-13-math-r008-repaired-independent-acceptance-review.md,
and docs/reports/2026-07-12/math-genre-implementation-plan-implementation-report.md.

Inspect Git state first. Baseline is ac21261; expected HEAD is
ab9a32a7d880e3234b33f10b41e1a95917a195d3, but Git is authoritative. Preserve
all tracked, staged, unstaged, and untracked changes, especially
.tmp/mock-openai-server.mjs, packages/educational-renderer/ and its artifacts,
todo-prompts/linux-math-video-rendering/, and the uncommitted accepted R-001
through R-008 implementation, tests, prompts, and reports. Do not clean, reset,
unstage, commit, regenerate fixtures, modify generated episode or educational-
renderer assets, edit generated dist files, change pnpm-lock.yaml, or revert
accepted R-001 through R-008 work.

R-008 is accepted dated 2026-07-13. Implement R-009 only as one bounded,
provider-free batch: complete localized math metadata, deterministic thumbnail
assets, playlist catalog/policy, a genre-neutral fake-testable YouTube publish
core with legacy compatibility, and a strictly non-mutating executable math
publish preflight. Keep R-009 implemented but pending a separate independent
acceptance. Do not start R-010.

No part of this task authorizes credentials, paid providers, public or private
network access, a real YouTube client, upload, playlist mutation, remote render,
or publish. The CLI surface must remain dry-run-only. Tests may use injected
fakes only. A dry run must not instantiate a live client or client factory.

Inspect current source and matching tests before editing, especially:

- packages/math-education/src/metadata/math-metadata.ts
- packages/math-education/src/publishing/types.ts
- packages/math-education/src/publishing/dry-run-manifest.ts
- packages/math-education/src/curriculum/release.ts
- packages/math-education/src/curriculum/prerequisite-graph.ts
- packages/math-education/src/orchestration/pilot-simulation.ts
- packages/math-education/src/orchestration/artifact-schemas.ts
- packages/math-rendering/src/assets/teacher.ts
- packages/math-rendering/src/components/math-components.ts
- packages/math-rendering/src/components/svg-cache.ts
- packages/math-rendering/src/index.ts
- packages/youtube-upload/src/index.ts
- packages/youtube-upload/src/index.unit.test.ts
- packages/config/src/math-config.ts
- apps/cli/src/math-commands.ts
- apps/cli/src/math-commands.unit.test.ts
- apps/cli/src/index.ts

Use source as authoritative. Inspect package exports, dependency direction,
tsconfig, focused-test wrapper, and Vitest config before choosing exact files or
commands. Reuse current schemas, canonical hashing, atomic writes, workspace
containment, teacher assets, math components, and upload retry/report helpers
where they fit. Do not import story/horror prompt or thumbnail code into math.
Do not introduce a dependency from story packages to math.

Implement the following contract.

1. Localized metadata and stable playlist catalog

- Replace the three-skill hard-coded metadata boundary with a strict,
  deterministic production contract that works for every rollout-capable math
  lesson without inventing unsupported claims. Preserve five languages
  `de/en/es/fr/pt` and explicit locale/region choices already established.
- Metadata must bind lessonId, skillId, curriculum release, grade, variant,
  language, objective/content identity, and timing identity. Unknown fields,
  mismatched identity, unsupported locale/skill, or missing source evidence
  must fail closed.
- Produce localized title, description, chapters, tags/search terms, hashtags,
  thumbnail copy, and playlist display names. No German leakage is allowed in
  non-German outputs. Titles remain <=100 characters; descriptions remain
  within YouTube limits; chapters are monotone, within authoritative timing,
  and include the required lesson beats.
- Include stable previous/next prerequisite-DAG neighbors when they exist and
  explicit null/absence at boundaries. Never infer neighbors from filenames or
  arbitrary seed order; use the reviewed graph/topological order.
- Introduce a strict versioned playlist catalog with stable keys and localized
  names. Every metadata artifact must resolve exactly one grade, one topic, and
  one variant playlist. Reject missing, duplicate, unknown, wrong-kind, or
  locale-mismatched keys. Keep display names localized while keys remain stable.
- Keep existing callers source-compatible only where that does not preserve an
  unsafe incomplete contract. Prefer an additive reviewed context/input object
  and migrate math callers/tests explicitly rather than optional data that
  silently omits required R-009 identity or DAG fields.

2. Deterministic thumbnail asset

- Add a math-native versioned thumbnail specification and renderer under
  packages/math-rendering. Do not use the horror thumbnail compiler, LLMs,
  image generation, network fonts, or generated episode assets.
- Produce a deterministic 16:9 asset from structured lesson/fact data, the
  approved grade profile, a validated Alex teacher pose, localized 2-5-word
  thumbnail text, grade/variant indicator, and one verified formula/problem
  fact. Do not accept arbitrary untrusted SVG/HTML/LaTeX.
- Bind lesson/skill/language/variant, input hashes, renderer/profile/teacher
  versions, dimensions, safe areas, text measurements/readability evidence,
  output path, and content hash in a strict manifest. The asset and manifest
  must be reproducible for identical inputs and change when any bound input
  changes.
- Enforce 16:9 dimensions, safe-area containment, mobile-readable minimum text,
  2-5 Unicode words, teacher <=25% of frame, and priority for formula/problem
  content. Missing/hash-wrong teacher pose, fact mismatch, overflow, excessive
  text, or invalid dimensions must block; no placeholder may be publish-ready.
- Write only through an explicit temp/test workspace in tests. Do not create or
  modify repository generated assets or invoke the production render.

3. Explicit math brand and publish-preflight policy

- Add a strict, versioned math brand policy schema at the most appropriate
  genre-neutral/math boundary after inspecting current config. It must map each
  enabled language to an explicit math channel ID and required playlist IDs,
  and require explicit privacy, madeForKids, and containsSyntheticMedia policy.
- Privacy must be `private` for R-009. Missing language/channel/policy/playlist
  mapping, duplicate IDs, empty IDs, unknown keys, or any attempt to reuse
  story credentials/defaults must yield a structured `PUBLISH_BLOCKED` result.
  Do not guess madeForKids or synthetic-media values.
- Dry-run validation may use non-secret channel and playlist IDs but must not
  require, read, print, or persist OAuth secrets. Keep secrets out of artifacts,
  reports, logs, and test fixtures.
- Upgrade the publish dry-run packet to a strict versioned identity-bound
  preflight artifact. Bind authoritative metadata, thumbnail, final media,
  quality, brand-policy, channel, privacy, and all required playlist hashes or
  IDs. It must state dispatchAllowed=false, paidProviderCalled=false,
  networkCalls=0, mutations=0, and precise blockers.

4. Genre-neutral publish core and legacy compatibility

- Extract or add a genre-neutral `publishYoutubeMedia` core in
  packages/youtube-upload with explicit media/thumbnail/metadata paths,
  content identity, channel target, policy, and `playlistIds[]`. It must be
  injectable with a fake client and must not contain math-specific imports.
- Preserve `uploadYoutubeEpisode` as the story/episode wrapper. Preserve the
  existing `playlistId` contract and normalize it internally to one playlist.
  Existing defaults and report fields must remain compatible unless an
  additive field is required.
- Deduplicate `playlistIds[]` deterministically. Attempt every required unique
  playlist assignment, report each result, and return `PUBLISH_BLOCKED` if any
  required assignment fails. Never hide a partial playlist failure.
- Validate authenticated channel ownership before upload/mutation. Channel
  mismatch or missing required policy must block before `videos.insert`,
  `thumbnails.set`, or `playlistItems.insert`.
- Make repeated execution idempotent from a strict identity/request fingerprint
  and prior report: reuse a completed matching video/thumbnail/playlist result
  without duplicate mutations; reject stale or identity-mismatched reports.
- Do not call this mutation-capable core from the R-009 math CLI. Exercise it
  only with fakes in unit tests. Do not add a default live client path for math.

5. Executable, non-mutating CLI preflight and workflow integration

- Keep `math publish` gated by the accepted R-008 workflow-owned v2 quality,
  approval, identity, locale, lineage, and exit semantics. Do not weaken any
  R-008 checks or replace MathCliSemanticError handling.
- Make `math publish --dry-run` execute a complete read-only preflight against
  exactly one workflow-owned metadata artifact, thumbnail manifest/asset,
  final-media evidence, publish packet, and explicit brand policy for the
  requested lesson/language. Enforce contained paths, schemas, hashes,
  producers, parents, identity, and selected scope.
- A valid preflight prints the resolved channel, private policy, playlist
  assignments, authoritative paths/hashes, blockers=[], mutations=0,
  networkCalls=0, and dispatchAllowed=false. It must not write even a report.
- Invalid input/config/artifact returns exit 1; semantic quality/policy/catalog
  blocking returns exit 3. Missing `--dry-run` returns exit 1. No option may
  enable real publishing, paid providers, or network dispatch.
- Update pilot/workflow artifact production only as required to create strict
  metadata, thumbnail, catalog, and preflight inputs. Preserve RENDER_BLOCKED
  while final media is absent; do not mark the current simulation READY merely
  because metadata and thumbnail work. Stage fingerprints and downstream
  invalidation must include every new schema/catalog/renderer/policy version.

6. Required adversarial tests

- Five-locale metadata tables: titles/descriptions/chapters/tags/hashtags,
  no source-language leakage, identity mismatch, timing bounds, DAG first/
  middle/last neighbors, and unsupported skill/locale.
- Catalog: stable keys/localized names, exactly grade/topic/variant, missing,
  duplicate, unknown, wrong-kind, and unmapped brand playlist.
- Thumbnail: deterministic bytes/hash, changed-input invalidation, 16:9,
  2-5 words, safe area, mobile text, teacher <=25%, structured fact binding,
  missing/hash-wrong teacher, overflow, and no horror import.
- Generic publish core: legacy single playlist unchanged; multiple unique
  playlists; duplicate removal; all inserts attempted on partial failure;
  channel mismatch before mutation; missing madeForKids/privacy/synthetic/
  channel/playlist policy; matching repeat is idempotent; stale report rejected.
- CLI: valid dry-run has zero writes/client factories/network/mutations;
  missing flag exit 1; missing policy/catalog/thumbnail/final-media or identity/
  hash/lineage mismatch fails closed; blocked quality retains real-entrypoint
  exit 3 and telemetry; no arbitrary path escape.
- Keep assertions semantic. Do not update snapshots or regenerate fixtures.

Before editing, state the exact files you expect to change and why. Keep the
implementation narrow; do not broadly refactor the large upload module. If a
clean generic-core extraction cannot be completed without destabilizing the
legacy wrapper, stop and report the exact boundary rather than weakening
compatibility or duplicating live upload logic.

Run directly affected checks in this order, adapting only filenames that the
implementation actually creates. Inspect the wrapper first and keep at most
three distinct test commands:

1. pnpm test:focused -- packages/math-education/src/metadata/math-metadata.unit.test.ts packages/math-education/src/publishing/math-publishing.unit.test.ts packages/math-rendering/src/thumbnail/math-thumbnail.unit.test.ts
2. pnpm test:focused -- packages/youtube-upload/src/generic-media-publish.unit.test.ts packages/youtube-upload/src/index.unit.test.ts
3. pnpm test:focused -- apps/cli/src/math-commands.unit.test.ts apps/cli/src/index-setup.unit.test.ts

Then run at most one affected-package typecheck command after focused tests pass:

pnpm --filter @mediaforge/math-education --filter @mediaforge/math-rendering --filter @mediaforge/youtube-upload --filter @mediaforge/cli typecheck

If a named new test file is unnecessary because the implementation places the
contract in an existing directly affected test, use that exact existing file
without adding a redundant suite. Classify failures before edits, rerun only
after a targeted fix, and stop under AGENTS.md convergence limits. Do not run
render integration, the 180-second production render, repository-wide tests,
builds, full lint, snapshot updates, fixture regeneration, provider/network
commands, or publish. If pnpm notices packages/educational-renderer, do not
retain any pnpm-lock.yaml modification.

When implementation and authorized checks are green, keep R-009 pending a new
separate independent acceptance dated 2026-07-13. Do not mark it accepted and
do not start R-010. Update only the relevant R-009 status in:

- docs/mathe/audits/remediation-backlog.md
- docs/reports/2026-07-12/math-genre-implementation-plan-implementation-report.md
- a new report at
  docs/reports/codex-runs/2026-07-13-math-r009-metadata-thumbnail-publish-dry-run.md

Keep reports under 200 words. Include exact changed paths, completed/partial/
uncompleted tasks, exact commands/results, current commit hash, deviations,
remaining risks, and anything not verified. Do not create any other report and
do not commit.
```
