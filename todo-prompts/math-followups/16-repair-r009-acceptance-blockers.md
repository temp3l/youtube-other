# Recommended next prompt: repair R-009 independent-acceptance blockers

```text
Continue from the current worktree. Read AGENTS.md,
docs/ai-context/context-pack.md,
docs/mathe/audits/remediation-backlog.md (R-009 and R-010 boundary only),
docs/mathe/audits/post-implementation-verification.md (F-009 only),
docs/mathe/plans/math-genre-implementation-plan.md (sections 8-12 only),
docs/mathe/plans/math-genre-test-matrix.md (M01-M04, P01-P06, D01, D03,
D05, and H03-H04 only),
docs/reports/codex-runs/2026-07-13-math-r009-metadata-thumbnail-publish-dry-run.md,
docs/reports/codex-runs/2026-07-13-math-r009-independent-acceptance-review.md,
docs/reports/codex-runs/2026-07-13-math-r008-repaired-independent-acceptance-review.md,
and docs/reports/2026-07-12/math-genre-implementation-plan-implementation-report.md.

Inspect Git state first. Baseline is ac21261; the last observed authoritative
HEAD was 69f26d39516bf3b507d562417e87992d46490fa1, but Git is authoritative.
Preserve every tracked, staged, unstaged, and untracked change. In particular,
preserve .tmp/mock-openai-server.mjs, all packages/educational-renderer source,
tests, docs, artifacts, and reports, todo-prompts/linux-math-video-rendering/,
todo-prompts/math-followups/, the accepted uncommitted R-001 through R-008,
and all implemented/reviewed R-009 source, tests, prompts, and reports. Do not
clean, reset, unstage, commit, regenerate fixtures, modify generated episode or
educational-renderer assets, edit generated dist files, change pnpm-lock.yaml,
or revert accepted work. If pnpm notices packages/educational-renderer, remove
only the incidental pnpm-lock.yaml delta and preserve every concurrent change.

R-008 is accepted. R-009 was implemented but independent acceptance was
rejected on 2026-07-13. Repair only the documented R-009 blockers as one
bounded provider-free batch. Keep R-009 pending a new, separate independent
acceptance when finished. Do not implement or start R-010.

This batch is authorized only while all repairs remain within the existing
R-009 metadata, thumbnail, artifact-lineage, generic-upload, legacy-wrapper,
and dry-run CLI boundaries. Before editing, inspect the source and identify the
exact shared upload extraction seam. If preserving the legacy wrapper would
require changed defaults, report fields, retries, telemetry, timeout behavior,
short-thumbnail behavior, single-playlist requests, verification, credentials,
or a second live orchestration path, stop without implementing that boundary.
Report the exact blocker; do not retain or add duplicated live upload logic.

No part of this task authorizes credentials, paid providers, public or private
network access, a live YouTube client/client factory, upload, thumbnail or
playlist mutation, remote render, production render, or publish. Unit tests may
execute mutation orchestration only through injected fakes. Do not invoke the
math CLI against production or repository-generated workspaces. Do not modify
generated assets, snapshots, fixtures, dist, or pnpm-lock.yaml.

Inspect source and matching tests before editing, especially:

- packages/math-education/src/metadata/math-metadata.ts
- packages/math-education/src/metadata/math-metadata.unit.test.ts
- packages/math-education/src/curriculum/dag.ts
- packages/math-education/src/curriculum/release.ts
- packages/math-education/src/domain/lesson.ts
- packages/math-education/src/lesson/timing.ts
- packages/math-education/src/localization/localization.ts
- packages/math-education/src/verification/protocol-schemas.ts
- packages/math-education/src/orchestration/artifact-schemas.ts
- packages/math-education/src/orchestration/workflow.ts
- packages/math-education/src/orchestration/workflow-invalidation.ts
- packages/math-education/src/orchestration/pilot-simulation.ts
- packages/math-education/src/publishing/dry-run-manifest.ts
- packages/math-education/src/publishing/math-publishing.unit.test.ts
- packages/math-rendering/src/thumbnail/math-thumbnail.ts
- packages/math-rendering/src/thumbnail/math-thumbnail.unit.test.ts
- packages/math-rendering/src/components/math-components.ts
- packages/math-rendering/src/assets/teacher.ts
- packages/math-rendering/src/profiles/profiles.ts
- packages/config/src/math-config.ts
- packages/config/src/math-config.unit.test.ts
- packages/youtube-upload/src/generic-media-publish.ts
- packages/youtube-upload/src/generic-media-publish.unit.test.ts
- packages/youtube-upload/src/index.ts
- packages/youtube-upload/src/index.unit.test.ts
- apps/cli/src/math-commands.ts
- apps/cli/src/math-commands.unit.test.ts
- apps/cli/src/index.ts
- apps/cli/src/index-setup.unit.test.ts

Also inspect package exports/dependencies, tsconfig files,
scripts/test-focused.sh, and Vitest configuration. Source is authoritative;
generated dist is outside scope. Confirm no math source imports story, horror,
dark-truth, story-thumbnail, image-generation, or paid-provider modules, and no
story package depends on math. Before edits, state the exact files expected to
change and why.

Implement this repair contract.

1. Release-derived metadata/DAG/timing evidence

- Replace the public arbitrary `prerequisiteOrder: string[]` production input
  with a strict reviewed metadata context derived from the loaded curriculum
  release. It must bind release ID/hash, prerequisite input hash or equivalent
  reviewed graph provenance, the complete stable topological order and its
  canonical hash, and the target skill's exact release identity.
- At runtime, prove the order is the complete duplicate-free permutation of
  the release skills and is the reviewed DAG result, not merely an array that
  contains the target skill. Do not accept caller-supplied first/middle/last
  arrays as reviewed evidence. Previous/next must come only from that bound
  order and remain null at real boundaries.
- Bind metadata to lesson ID, skill ID, release ID/hash, grade, variant,
  objective hash, recomputed lesson content hash, localization content/fact-lock
  identity, language/region, timing identity, and playlist catalog hash/version.
  Reject release/skill, objective, content, localization, and timing transplants.
- Add strict timing evidence without destabilizing accepted R-007/R-008
  contracts. Either introduce an additive identity-bound timing artifact or a
  strict metadata timing-evidence wrapper. It must bind lesson/skill/variant/
  language, timing payload hash, localization hash, duration, and exact ordered
  scene/segment IDs. A same-shaped timing manifest from another lesson or
  locale must fail before metadata generation.
- Require reviewed source/provenance and rollout capability explicitly. Every
  skill currently returned by the authoritative capability planner must either
  generate metadata or be excluded before the metadata stage. Do not add a
  hidden skill/topic switch.
- Keep all five localized surfaces and closed catalog semantics. Add attacks
  for arbitrary reordered/subset/superset/foreign orders, forged order hashes,
  release/skill transplants, stale lesson content hashes, cross-lesson and
  cross-locale timing, unsupported skill/locale, and catalog locale mismatch.

2. Verifier-bound deterministic thumbnail

- Replace the free `verificationHash` string with strict verifier evidence
  parsed from the existing verifier protocol/artifact contracts. Bind verifier
  artifact version, passed status, request/lesson/fact/check identity, semantic
  hash, verification result hash, and the exact displayed expression. Failed,
  unsupported, stale, wrong-lesson, wrong-fact, wrong-check, or malformed
  verification must block rendering.
- Ensure the selected fact occurs exactly once in the authoritative lesson and
  that lesson fact semantic data, verifier evidence, metadata fact ID, and
  thumbnail expression all agree. Recompute hashes rather than trusting caller
  strings.
- Measure or conservatively bound both localized text and formula/problem
  content against the actual fixed safe area and profile minimum glyph sizes.
  Reject long/deep AST formulas that overflow horizontally or vertically.
  Keep the formula/problem visually primary and teacher area <=25 percent.
- Remove operational absolute/temp paths from deterministic content hashing.
  Bind approved teacher version, pose ID/hash, renderer/spec/profile/font
  profile, dimensions, safe area, measurements, output name, and content hash.
  Identical semantic inputs in different temp roots must reproduce identical
  bytes and hashes. Do not use system/network-dependent input, arbitrary
  SVG/HTML/LaTeX, timestamps, remote fonts, or object-order-dependent hashing.
- Localize every visible grade/variant label; do not leave an English footer on
  non-English thumbnails. Continue to reject placeholder, missing, duplicate,
  path-escaping, symlinked, or hash-wrong teacher assets.
- Add semantic attacks for fabricated/stale verifier hashes, failed or
  unsupported results, identity swaps, long/deep formulas, temp-root changes,
  every bound version/hash change, and visible locale leakage.

3. Exact binary artifact lineage and read-only preflight

- Extend the workflow lineage contract narrowly so binary assets can be owned
  and hash-validated without being JSON-parsed. Use explicit schema/artifact
  versions or a strict payload kind; never infer binary handling from extension.
- Require exactly one workflow-owned thumbnail asset produced by the approved
  metadata/thumbnail stage and exactly one workflow-owned final-media asset
  produced by render, in addition to their JSON manifests/evidence. Bind exact
  parent fingerprints, producer, relative path, content hash, identity, and
  selected locale. Preserve containment, regular-file, and non-symlink checks.
- Update stage fingerprints and invalidation for every new metadata-context,
  timing-evidence, thumbnail/verifier, binary-lineage, and publish-packet
  version. A changed bound input must invalidate only the correct downstream
  stages.
- Make `math publish --dry-run` require exactly one quality, metadata, catalog,
  thumbnail manifest, thumbnail asset, final-media evidence, final-media asset,
  brand policy, and publish packet. Reject missing, duplicate, wrong-producer,
  wrong-parent, stale, hash-wrong, transplanted, traversal, and symlink inputs.
- Recompute the complete publish request fingerprint from these authoritative
  lineages. Require exact canonical quality path and exact locale-bound final
  evidence/media paths. Do not accept a caller-selected alternate valid-looking
  artifact.
- A valid preflight must remain zero-write and must not create/quarantine a
  report, instantiate a client/client factory, access credentials, dispatch,
  call a provider/network, or mutate anything. Output the exact authoritative
  paths/hashes, private policy, channel, all playlist assignments, blockers=[],
  dispatchAllowed=false, paidProviderCalled=false, networkCalls=0, mutations=0.
- Preserve exit 1 for input/config/artifact invalidity and exit 3 through
  MathCliSemanticError and the real top-level finalizer for semantic quality,
  policy, or catalog blocking. Preserve the pilot as RENDER_BLOCKED while final
  media is absent; it must not fabricate an approved thumbnail or packet.

4. One shared upload mutation seam and strict prior-report resume

- Do not keep `publishYoutubeMedia` as a second implementation of
  `videos.insert`, `thumbnails.set`, and `playlistItems.insert` alongside the
  legacy module. Extract one genre-neutral internal mutation/orchestration seam
  and make both the generic API and `uploadYoutubeEpisode` use it.
- The shared seam must have no math/story imports and must require an injected
  client/transport. There must be no default live-client path usable by math.
  Centralize request construction, channel ownership validation, video upload,
  thumbnail assignment, playlist assignment, and result capture sufficiently
  that the two paths cannot silently diverge.
- Adapt the legacy wrapper without changing its public signature, `playlistId`,
  defaults, request shape, retries, timeout values, telemetry, report fields,
  error/retry classification, previous-report behavior, short-thumbnail skip/
  intro behavior, single-playlist semantics, or post-upload verification. Lock
  these with characterization assertions before extraction.
- Preserve generic `playlistIds[]`: trim/reject empty IDs, stable deduplication,
  attempt every uncompleted unique required playlist despite an individual
  failure, report every result, and return structured PUBLISH_BLOCKED for any
  required failure without hiding partial mutations.
- Add a strict runtime schema for prior generic reports; accept `unknown`, parse
  before channel/network/mutation, and recompute all identity/request/channel/
  media/thumbnail/metadata/policy/playlist hashes and invariants. Reject
  malformed, duplicate, impossible-state, stale, transplanted, or merely
  fingerprint-copied reports before mutation.
- Prove partial resume: reuse an already uploaded video, assigned thumbnail,
  and each successful playlist; retry only failed/unattempted playlists; never
  duplicate a completed mutation. Also prove a matching complete report causes
  zero client calls and a stale/malformed report causes zero mutations.
- Convert upload/video/thumbnail errors into the documented structured result
  where the generic contract requires it; do not leak an unclassified success.
  Do not weaken legacy error behavior to accomplish this.

5. Test adequacy and compatibility

- Map semantic assertions to M01-M04, P01-P06, D01, D03, D05, H03, and H04.
  Do not count a test by name alone.
- Add the exact missing attacks above, especially release-bound DAG provenance,
  timing transplant, stale/fabricated verifier evidence, formula overflow,
  temp-root determinism, binary ownership/duplicates/symlinks, strict partial
  prior-report resume, zero math client factories, and legacy request/report
  compatibility.
- Keep assertions semantic. Do not update snapshots or regenerate fixtures.
- Tests may write only beneath explicit OS temporary workspaces. Do not create
  or modify repository/episode/generated assets.

Inspect the focused wrapper before trusting multi-file forwarding. After source
review and implementation, run only these checks in order and stay within the
AGENTS.md retry budget:

1. pnpm test:focused -- packages/math-education/src/metadata/math-metadata.unit.test.ts packages/math-education/src/publishing/math-publishing.unit.test.ts packages/math-rendering/src/thumbnail/math-thumbnail.unit.test.ts packages/config/src/math-config.unit.test.ts
2. pnpm test:focused -- packages/youtube-upload/src/generic-media-publish.unit.test.ts packages/youtube-upload/src/index.unit.test.ts
3. pnpm test:focused -- apps/cli/src/math-commands.unit.test.ts apps/cli/src/index-setup.unit.test.ts
4. pnpm --filter @mediaforge/math-education --filter @mediaforge/math-rendering --filter @mediaforge/youtube-upload --filter @mediaforge/config --filter @mediaforge/cli typecheck

If a check fails, classify and repair only the owning R-009 code, then rerun
within the budget. Stop rather than weakening assertions, changing more than
three fixtures, or repairing unrelated concurrent failures. Do not run render
integration, the 180-second render, repository-wide tests, builds, full lint,
snapshot updates, fixture regeneration, provider/network commands, upload, or
publish.

When the repair and authorized checks are green, leave R-009 pending a new
separate independent acceptance dated 2026-07-13 and leave R-010 unstarted.
Update only the relevant R-009 status in:

- docs/mathe/audits/remediation-backlog.md
- docs/reports/2026-07-12/math-genre-implementation-plan-implementation-report.md
- a new report at
  docs/reports/codex-runs/2026-07-13-math-r009-acceptance-blocker-repair.md

Do not overwrite either existing R-009 implementation or independent-review
report. Keep reports under 200 words and include exact changed paths,
completed/partial/uncompleted tasks, exact commands/results, current commit
hash, deviations, remaining risks, and anything not verified. Do not create
another prompt or report and do not commit.
```
