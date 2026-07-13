# Recommended next prompt: independently accept R-009

```text
Continue from the current worktree. Read AGENTS.md,
docs/ai-context/context-pack.md,
docs/mathe/audits/remediation-backlog.md,
docs/mathe/audits/post-implementation-verification.md (F-009 only),
docs/mathe/plans/math-genre-implementation-plan.md (sections 8-12 only),
docs/mathe/plans/math-genre-test-matrix.md (M01-M04, P01-P06, D01, D03,
D05, and H03-H04 only),
docs/reports/codex-runs/2026-07-13-math-r009-metadata-thumbnail-publish-dry-run.md,
docs/reports/codex-runs/2026-07-13-math-r008-repaired-independent-acceptance-review.md,
and docs/reports/2026-07-12/math-genre-implementation-plan-implementation-report.md.

Inspect Git state first. Baseline is ac21261; the last observed authoritative
HEAD was 69f26d39516bf3b507d562417e87992d46490fa1, but Git is authoritative.
Preserve every tracked, staged, unstaged, and untracked change, especially
.tmp/mock-openai-server.mjs, packages/educational-renderer/ and its artifacts
and concurrent tests, todo-prompts/linux-math-video-rendering/, and the
uncommitted accepted R-001 through R-008 plus implemented R-009 source, tests,
prompts, and reports. Do not clean, reset, unstage, commit, regenerate fixtures,
modify generated episode or educational-renderer assets, edit generated dist
files, change pnpm-lock.yaml, or revert any accepted work.

R-008 is accepted. R-009 is implemented dated 2026-07-13 but remains pending a
new, separate independent acceptance. Independently review and accept or reject
R-009 only. Do not repair production code, tests, fixtures, prompts, or reports
other than the three acceptance-status documents listed below. Do not start or
implement R-010. If any material defect, unsafe compatibility boundary, missing
adversarial evidence, or unverifiable contract is found, reject R-009, leave it
pending, and document the exact blocker and smallest separate repair task.

No part of this review authorizes credentials, paid providers, public or
private network access, a live YouTube client or client factory, upload,
thumbnail mutation, playlist mutation, remote render, production render, or
publish. Tests must remain provider-free and use injected fakes only. Do not
execute the math publish core except through unit fakes. Do not invoke the math
CLI against production or repository-generated workspaces.

Inspect source and matching tests before running commands, especially:

- packages/math-education/src/metadata/math-metadata.ts
- packages/math-education/src/metadata/math-metadata.unit.test.ts
- packages/math-education/src/publishing/types.ts
- packages/math-education/src/publishing/dry-run-manifest.ts
- packages/math-education/src/publishing/math-publishing.unit.test.ts
- packages/math-education/src/curriculum/dag.ts
- packages/math-education/src/curriculum/release.ts
- packages/math-education/src/orchestration/artifact-schemas.ts
- packages/math-education/src/orchestration/pilot-simulation.ts
- packages/math-education/src/orchestration/workflow.ts
- packages/math-education/src/orchestration/quality-gate.ts
- packages/math-rendering/src/thumbnail/math-thumbnail.ts
- packages/math-rendering/src/thumbnail/math-thumbnail.unit.test.ts
- packages/math-rendering/src/assets/teacher.ts
- packages/math-rendering/src/components/math-components.ts
- packages/math-rendering/src/profiles/profiles.ts
- packages/math-rendering/src/index.ts
- packages/config/src/math-config.ts
- packages/config/src/math-config.unit.test.ts
- packages/config/src/index.ts
- packages/youtube-upload/src/generic-media-publish.ts
- packages/youtube-upload/src/generic-media-publish.unit.test.ts
- packages/youtube-upload/src/index.ts
- packages/youtube-upload/src/index.unit.test.ts
- apps/cli/src/math-commands.ts
- apps/cli/src/math-commands.unit.test.ts
- apps/cli/src/index.ts
- apps/cli/src/index-setup.unit.test.ts

Also inspect affected package.json exports, dependency direction, tsconfig,
scripts/test-focused.sh, and Vitest configuration. Source is authoritative;
generated dist is intentionally not part of this task. Confirm no math code
imports story, horror, dark-truth, story thumbnail, image-generation, or paid
provider modules, and no story package depends on math.

Perform an adversarial source audit rather than trusting the implementation
report or existing passing assertions.

1. Metadata identity, localization, timing, DAG, and catalog

- Confirm the production API requires a reviewed context and binds lessonId,
  skillId, curriculum release ID/hash, grade, variant, language/region,
  objective, lesson content, localization, timing, and catalog identity.
- Confirm strict schemas reject unknown fields, unsupported language/skill,
  missing source evidence, identity transplants, objective/content/timing
  mismatches, malformed hashes, and unsupported claims.
- Confirm every rollout-capable lesson can generate metadata without a hidden
  three-skill metadata switch. Cross-check rollout capability source rather
  than assuming the three current pilot fixtures are the permanent boundary.
- Review all `de/en/es/fr/pt` surfaces: title, description, chapters, tags,
  search terms, hashtags, thumbnail copy, and playlist names. Confirm explicit
  regions, no German leakage outside German, title <=100, description <=5000,
  and 2-5 Unicode-word thumbnail copy.
- Confirm chapters use authoritative timing, are strictly monotone and within
  duration, and cover opening, example, challenge, and solution beats.
- Confirm previous/next values come only from the reviewed prerequisite DAG
  topological order, remain stable, and are explicitly null at boundaries.
  Reject acceptance if arbitrary caller order can masquerade as reviewed DAG
  evidence without a release/order binding.
- Confirm catalog keys are closed, stable, versioned, locale-independent, and
  resolve exactly one grade, topic, and variant entry. Reject missing,
  duplicate, unknown, wrong-kind, locale-mismatched, or extra dimension keys.

2. Deterministic math-native thumbnail

- Confirm the renderer accepts only structured, schema-validated lesson/fact
  data and approved expression AST, never arbitrary SVG/HTML/LaTeX or remote
  input. Formula/problem content must remain primary.
- Confirm lesson/skill/language/variant, lesson and metadata hashes, exact
  verified fact identity/semantic/verification hashes, renderer/spec/profile/
  teacher versions, dimensions, safe areas, measurements, output path, and
  content hash are bound in the manifest and deterministic asset bytes.
- Confirm identical inputs reproduce bytes/hash and every bound input change
  invalidates them. Check for nondeterministic timestamps, paths, fonts, object
  order, or platform-dependent serialization.
- Confirm fixed 1920x1080 16:9 output, safe-area containment, profile minimum
  glyph sizes, mobile readability, 2-5 Unicode words, measured overflow
  blocking, and teacher area <=25 percent.
- Confirm missing pose, pose hash mismatch, duplicate/mismatched lesson fact,
  stale verification, wrong profile, excessive text, overflow, invalid output
  name/dimensions, and placeholder teacher versions fail closed.
- Confirm tests write only below explicit temporary workspaces and no generated
  repository or episode asset was created or modified.

3. Brand policy and strict publish packet

- Confirm `math-brand-policy.v1` is strict and requires all five enabled
  languages, unique non-empty math channel IDs, required stable playlist IDs,
  privacy=`private`, explicit madeForKids, and explicit
  containsSyntheticMedia. Unknown fields and duplicate/empty mappings block.
- Confirm no story credentials/defaults or OAuth fields are accepted, read,
  logged, printed, or persisted. Non-secret fake IDs are allowed in tests.
- Confirm invalid or missing policy/catalog decisions become structured
  `PUBLISH_BLOCKED`, not guessed defaults or generic success.
- Confirm `math-publish-dry-run.v2` binds exact metadata, thumbnail manifest and
  asset, final-media evidence/media, quality, brand-policy, channel, private
  policy, and every required playlist path/hash/ID plus a recomputed strict
  request fingerprint.
- Confirm blockers are precise and a valid packet always has
  dispatchAllowed=false, paidProviderCalled=false, networkCalls=0, mutations=0.

4. Genre-neutral publish core and legacy compatibility

- Confirm `publishYoutubeMedia` has no math/story imports and requires explicit
  media, thumbnail, metadata, content identity, channel, policy,
  `playlistIds[]`, and an injected client. It must have no default live-client
  path usable by math.
- Confirm channel ownership and complete policy validation occur before
  videos.insert, thumbnails.set, or playlistItems.insert.
- Confirm deterministic playlist de-duplication, every unique assignment is
  attempted despite an individual failure, every result is reported, and any
  required failure returns PUBLISH_BLOCKED without hiding partial mutation.
- Confirm matching prior reports reuse each completed video, thumbnail, and
  playlist result without duplicate mutation, including recovery from a
  partially completed report. Reject stale, malformed, or identity/request-
  mismatched prior reports before mutation.
- Inspect the boundary with `uploadYoutubeEpisode` carefully. The legacy
  `playlistId`, defaults, retries, report fields, short-thumbnail behavior,
  telemetry, and single-playlist request must remain unchanged.
- Determine whether the additive generic core duplicates live upload
  orchestration from the legacy module. The implementation prompt explicitly
  required stopping rather than duplicating live upload logic if a clean
  extraction would destabilize compatibility. Reject R-009 if this boundary is
  materially duplicated, divergent, or cannot be proven safe; document the
  exact shared extraction seam instead of repairing it here.

5. Executable non-mutating CLI preflight and workflow integration

- Confirm `math publish` remains dry-run-only and no option enables dispatch,
  paid providers, a client, client factory, network, upload, or mutation.
- Confirm missing `--dry-run` is exit 1. Invalid input/config/artifact is exit
  1. Semantic quality/policy/catalog blocking is exit 3 through
  MathCliSemanticError and the real top-level telemetry/finalizer.
- Confirm the requested lesson/language is in authoritative R-008 quality
  scope and every consumed artifact is workflow-owned exactly once, schema-
  valid, hash-valid, parent/producer-valid, identity-matched, contained,
  non-symlinked, and selected-scope matched.
- Confirm preflight reads exactly one metadata artifact, catalog, thumbnail
  manifest and asset, final-media evidence and media, brand policy, quality,
  and publish packet. Missing/duplicate/wrong-producer/wrong-parent/stale/hash-
  wrong/transplanted/path-escaping inputs must fail closed with correct exits.
- Confirm valid output includes resolved channel, private policy, all playlist
  assignments, authoritative paths/hashes, blockers=[], mutations=0,
  networkCalls=0, paidProviderCalled=false, and dispatchAllowed=false.
- Prove a valid dry run performs zero writes, creates no report, and never
  instantiates a live client or client factory.
- Confirm stage fingerprints and downstream invalidation include every new
  metadata/catalog/thumbnail/renderer/policy/packet version. Confirm the pilot
  remains RENDER_BLOCKED while final media is absent and does not fabricate a
  publish-ready thumbnail or packet from placeholder assets.

6. Test adequacy and compatibility

- Map existing semantic assertions to M01-M04, P01-P06, D01, D03, D05, H03,
  and H04. Do not count a test merely because its name resembles the contract.
- Pay special attention to prior-report partial resume, unsupported skill and
  locale, authoritative DAG-order provenance, locale leakage, catalog locale
  mismatch, missing config fields, thumbnail verification binding, zero CLI
  client factories, missing final media, symlink/traversal, and legacy wrapper
  report compatibility.
- Existing implementation-report risks are not automatically acceptable:
  independently resolve whether the additive generic-core boundary, the
  previously unrun config unit suite, and final schema changes are sound.
- Keep assertions semantic. Do not update snapshots or regenerate fixtures.

Run only these checks, in order, after source review:

1. pnpm test:focused -- packages/math-education/src/metadata/math-metadata.unit.test.ts packages/math-education/src/publishing/math-publishing.unit.test.ts packages/math-rendering/src/thumbnail/math-thumbnail.unit.test.ts packages/config/src/math-config.unit.test.ts
2. pnpm test:focused -- packages/youtube-upload/src/generic-media-publish.unit.test.ts packages/youtube-upload/src/index.unit.test.ts
3. pnpm test:focused -- apps/cli/src/math-commands.unit.test.ts apps/cli/src/index-setup.unit.test.ts
4. pnpm --filter @mediaforge/math-education --filter @mediaforge/math-rendering --filter @mediaforge/youtube-upload --filter @mediaforge/config --filter @mediaforge/cli typecheck

Inspect the focused wrapper before trusting multi-file forwarding. Stay within
AGENTS.md command and retry budgets. If any check fails, classify it and stop;
do not edit implementation, tests, inline fixtures, snapshots, or generated
artifacts. Do not run render integration, the 180-second render, broad tests,
builds, full lint, snapshot updates, fixture regeneration, provider/network
commands, or publish. If pnpm notices packages/educational-renderer, remove
only the incidental pnpm-lock.yaml delta and preserve all educational-renderer
source/test changes.

Issue an explicit accept or reject decision. Accept only if independent source
review and fresh authorized checks establish the complete R-009 contract,
including the generic-core/legacy boundary. If accepted, mark R-009 accepted
dated 2026-07-13 and leave R-010 unstarted. If rejected, keep R-009 pending and
record the exact defect or missing evidence, attack, owning module, smallest
separate repair, and why existing tests did not establish acceptance.

Update only:

- docs/mathe/audits/remediation-backlog.md
- docs/reports/2026-07-12/math-genre-implementation-plan-implementation-report.md
- a new report at
  docs/reports/codex-runs/2026-07-13-math-r009-independent-acceptance-review.md

Do not overwrite the R-009 implementation report. Keep reports under 200
words. Include exact changed paths, exact commands/results, current commit
hash, decision, deviations, remaining risks, and anything not verified. Do not
create another prompt or report, do not commit, and do not start R-010.
```
