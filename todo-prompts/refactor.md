Act as a senior TypeScript platform architect reviewing a production-grade, multilingual YouTube episode-generation pipeline.

Create and switch to a new Git branch before doing any work.

Git requirements:

- Detect the repository’s correct default development branch instead of assuming `main` or `master`.
- Ensure the working tree is clean before creating the branch.
- If uncommitted changes exist, do not discard, reset, stash, overwrite, or modify them. Stop and report the blocking files.
- Fetch the latest remote references.
- Update the detected base branch using fast-forward only.
- Create and switch to this branch:

REFACTOR-episode-filesystem-layout-review

- If the branch already exists locally or remotely, append a short timestamp to create a unique branch name.
- Do not push the branch.
- Do not commit anything.
- Report the active branch name at the end.

Use a safe flow equivalent to:

git status --short
git remote show origin
git fetch --prune origin
git switch <detected-base-branch>
git pull --ff-only origin <detected-base-branch>
git switch -c REFACTOR-episode-filesystem-layout-review

After creating the branch, perform a repository-wide architecture review focused on file placement, generated output structure, localization metadata, manifest ownership, and deterministic downstream asset discovery.

Do not implement production-code changes yet.

The purpose of this task is to:

1. inspect the current implementation,
2. identify structural and architectural problems,
3. design a clear target directory structure,
4. define path, naming, ownership, and lifecycle invariants,
5. produce a detailed dependency-ordered implementation plan for a later coding task.

## Primary problem

The current pipeline has inconsistent or unclear handling of:

- input files,
- generated output files,
- localized scripts,
- localized metadata,
- full-length and short-form variants,
- generated scene definitions,
- image prompts,
- generated images,
- character assets,
- audio,
- transcripts,
- subtitles,
- rendered videos,
- thumbnails,
- YouTube upload metadata,
- episode manifests,
- intermediate files,
- temporary files,
- logs,
- cost reports,
- downstream asset lookup.

There are recurring problems with files being written to unexpected locations or downstream stages failing to find them.

Pay particular attention to:

- `scenes.json`,
- episode manifest files,
- localized manifest data,
- generated output folders,
- source versus generated artifacts,
- full versus short variants,
- language-specific versus language-independent assets,
- assets generated once and reused across languages,
- assets generated independently per language,
- absolute versus relative paths,
- duplicated path construction,
- hidden output-directory defaults,
- inconsistent producer and consumer assumptions,
- remote rendering and rsync behavior,
- resume and retry state.

Use the correct term `manifest` throughout.

## Scope

Inspect all relevant parts of the repository, including:

- CLI commands,
- episode-generation workflows,
- localization workflows,
- script-generation services,
- metadata-generation services,
- scene-generation services,
- image-prompt generation,
- image generation,
- character extraction,
- character asset generation,
- TTS generation,
- transcript generation,
- subtitle generation,
- thumbnail generation,
- video rendering,
- short-video rendering,
- remote rendering,
- rsync workflows,
- upload preparation,
- YouTube upload logic,
- manifest readers and writers,
- retry and resume logic,
- batch API workflows,
- cleanup commands,
- tests,
- configuration files,
- documentation,
- filesystem utilities.

Search specifically for:

- `path.join`,
- `path.resolve`,
- `dirname`,
- `basename`,
- `relative`,
- `normalize`,
- hard-coded directories,
- output-directory defaults,
- language-code handling,
- locale handling,
- content-variant handling,
- direct filesystem reads and writes,
- `scenes.json`,
- manifest filenames,
- `generated`,
- `generated-assets`,
- episode folder discovery,
- recursive scans,
- glob patterns,
- filename parsing,
- asset lookup,
- logic that infers asset types from filenames,
- logic that reconstructs paths instead of using a shared resolver.

## Review objective 1: Map the current filesystem model

Document the directory structure as it actually exists in code.

For every major pipeline stage, identify:

- input path,
- output path,
- filename convention,
- owning module,
- locale dimension,
- content-variant dimension,
- artifact lifecycle category,
- producer,
- consumers,
- whether the path is passed explicitly or reconstructed implicitly,
- confirmed problems,
- suspected risks.

Create a table with at least:

| Stage | Input | Output | Locale-specific | Variant-specific | Producer | Consumers | Lifecycle | Problems |

Treat implementation as the source of truth.

Note every discrepancy between code, tests, configuration, examples, and documentation.

## Review objective 2: Review `scenes.json`

Determine:

- where `scenes.json` is currently written,
- every code path that writes it,
- every code path that reads it,
- whether multiple `scenes.json` files may exist per episode,
- whether scenes differ by locale,
- whether scenes differ between full and short variants,
- whether scene definitions are semantic narration scenes, visual scenes, render instructions, or image jobs,
- whether image-generation state is mixed into scene definitions,
- whether rendering mutates the file,
- whether retry state is stored inside it,
- whether generated image paths are embedded,
- whether those paths are portable,
- whether localized narration text is duplicated inside shared data,
- whether scene IDs remain stable across regeneration,
- whether the file supports partial regeneration and resume safely,
- whether concurrent workers can overwrite each other,
- whether full and short variants can collide,
- whether locales can collide.

Recommend a clear target ownership model.

Evaluate whether the target system should separate:

- canonical semantic scenes,
- locale-specific narration scenes,
- variant-specific scenes,
- image-generation jobs,
- generated image state,
- render manifests,
- execution state.

Do not combine these automatically. Recommend the smallest coherent separation supported by the actual workflow.

## Review objective 3: Review manifest responsibilities

Find every manifest-like file, schema, interface, type, and helper.

Determine whether the current design conflates:

- episode identity,
- canonical source content,
- localization state,
- scene definitions,
- generated assets,
- execution state,
- retry state,
- batch-job state,
- cost data,
- timestamps,
- rendering state,
- upload state,
- remote-processing state.

Review:

- naming,
- location,
- ownership,
- schema versioning,
- runtime validation,
- atomic writes,
- partial writes,
- corruption handling,
- migration support,
- backward compatibility,
- concurrent writes,
- stale paths,
- absolute paths,
- duplicated data,
- optional-field state machines,
- write amplification,
- whether several services mutate the same file.

Recommend the smallest coherent manifest model.

Possible files may include:

- `episode.json`,
- `localization.json`,
- `scenes.json`,
- `assets.json`,
- `render.json`,
- `upload.json`,
- `costs.json`,
- `execution.json`.

These are examples only. Do not create unnecessary fragmentation.

Every proposed file must have one clear owner and a precise purpose.

## Review objective 4: Define artifact ownership and lifecycle

For every proposed file and directory, define:

- creator,
- allowed writers,
- readers,
- mutability,
- reproducibility,
- deletion safety,
- source-control policy,
- backup policy,
- remote-sync policy,
- resume requirements.

Use a small lifecycle classification such as:

- manually maintained source,
- configuration,
- generated deterministic,
- generated non-deterministic,
- intermediate,
- cache,
- execution state,
- final deliverable,
- logs and audit data.

## Review objective 5: Design the target folder structure

Propose a deterministic, logical folder structure supporting:

- many episodes,
- canonical English source content,
- multiple localized versions,
- full and short variants,
- shared character assets,
- locale-specific character references where required,
- localized scripts,
- localized metadata,
- localized thumbnails,
- locale-specific audio,
- locale-specific transcripts,
- scenes,
- image prompts,
- generated images,
- image retries,
- batch processing,
- local rendering,
- remote rendering,
- resumability,
- final deliverables,
- upload state,
- logs,
- cost reports,
- temporary files.

The structure must clearly distinguish:

- source files,
- generated files,
- shared assets,
- locale-specific assets,
- variant-specific assets,
- intermediate state,
- cache,
- execution state,
- final output.

Use a concrete example for episode `009`, including:

- English full,
- English short,
- German full,
- German short,
- Spanish full,
- French full,
- Portuguese full.

A possible direction is:

episodes/
009-the-christmas-doll-opened-her-eyes/
episode.json
source/
shared/
locales/
en/
full/
short/
de/
full/
short/
state/
logs/

Do not adopt this blindly. Improve it based on the actual repository.

## Review objective 6: Define path invariants

Define exact enforceable invariants.

At minimum:

- one canonical episode root,
- one authoritative path-resolution layer,
- no path construction duplicated in business logic,
- no filesystem identifiers derived from localized display titles,
- stable episode IDs,
- normalized locale codes,
- normalized content-variant identifiers,
- filenames safe across Linux, macOS, and Windows,
- no absolute paths persisted in portable manifests,
- persisted paths relative to an episode root or configured storage root,
- no `..` traversal,
- no writes outside the configured workspace,
- deterministic filenames,
- explicit `scenes.json` ownership,
- explicit manifest schema versions,
- atomic JSON writes,
- runtime validation for persisted JSON,
- deterministic asset lookup,
- no broad recursive scans where direct lookup is possible,
- generated files never mixed with manually maintained source,
- full and short variants never share mutable output paths,
- locales never share mutable output paths,
- temporary files use predictable suffixes and are excluded from rsync.

Clarify whether localized slugs may exist and ensure they remain presentation metadata rather than filesystem identity.

## Review objective 7: Review localization modeling

Find how language and locale are represented.

Review whether the pipeline incorrectly assumes:

- one script per episode,
- one metadata file per episode,
- one `scenes.json` per episode,
- one thumbnail per episode,
- English filenames for localized assets,
- localized titles as paths,
- every locale has full and short variants,
- localized scene counts equal English scene counts,
- localized timing data can be shared,
- thumbnails are language-independent,
- one manifest can safely represent every locale.

Recommend a model supporting:

- canonical source locale,
- target locale,
- localized title,
- localized slug,
- localized narration,
- English production instructions,
- English metadata headings,
- locale-specific YouTube metadata,
- locale-specific thumbnail text,
- short-form hook,
- full and short variants,
- fallback rules,
- localization status,
- validation status,
- generation status,
- review status.

The system must explicitly support keeping production instructions and metadata headings in English while localizing narration content.

## Review objective 8: Review TypeScript data contracts

Find types used for:

- episode IDs,
- locale codes,
- content variants,
- scenes,
- asset references,
- manifests,
- output paths,
- render jobs,
- localization jobs,
- batch jobs,
- upload jobs.

Identify weaknesses including:

- plain `string` for every identifier,
- nullable fields without lifecycle meaning,
- optional fields used as state machines,
- arbitrary path strings,
- duplicated interfaces,
- unvalidated JSON parsing,
- unsafe casts,
- implicit `any`,
- duplicated enums,
- inconsistent locale codes,
- filenames mixed with paths,
- filesystem paths mixed with URLs,
- absolute and relative paths represented identically.

Recommend a strict but practical type model using:

- branded types where useful,
- discriminated unions,
- readonly structures,
- versioned schemas,
- runtime validation,
- explicit asset kinds,
- explicit lifecycle states,
- typed path resolver inputs,
- typed relative path references.

Do not over-engineer.

## Review objective 9: Review reliability and concurrency

Inspect risks involving:

- simultaneous local and remote rendering,
- multiple workers writing the same manifest,
- parallel localization jobs,
- parallel image jobs,
- batch API processing,
- interrupted execution,
- stale locks,
- partial JSON writes,
- duplicate generation,
- retry overwrite behavior,
- one locale deleting another locale’s outputs,
- one variant overwriting another variant,
- unsafe `--force`,
- unsafe cleanup,
- rsync transferring partial files,
- readers seeing half-written state.

Recommend:

- atomic write strategy,
- lock or lease strategy only where required,
- temporary filename conventions,
- completion markers,
- idempotency rules,
- overwrite rules,
- file hashing where useful,
- manifest ownership,
- conflict prevention,
- resume semantics,
- failure recovery semantics.

## Review objective 10: Review performance

Identify problems caused by the current layout:

- repeated recursive scans,
- repeated JSON parsing,
- repeated manifest rewrites,
- unnecessary media copies,
- rsync scanning cache and temporary directories,
- remote rendering transferring irrelevant assets,
- downstream stages using globs instead of deterministic paths,
- unnecessary checksum calculation,
- excessive small files,
- duplicated localized assets,
- repeated source discovery.

Recommend:

- directories to include in remote sync,
- directories to exclude,
- generated state required by remote rendering,
- outputs returned from remote rendering,
- cache folders that should remain local,
- folders containing partial files that must not be synced.

## Review objective 11: Review observability

Determine whether structured logs clearly show:

- episode ID,
- locale,
- content variant,
- pipeline stage,
- asset kind,
- selected input,
- output written,
- manifest updated,
- path resolution rule,
- asset reuse versus regeneration,
- resume state,
- remote versus local execution,
- batch job ID,
- failure reason.

Recommend standard fields such as:

- `episodeId`,
- `locale`,
- `variant`,
- `stage`,
- `assetKind`,
- `inputPath`,
- `outputPath`,
- `manifestPath`,
- `jobId`,
- `operation`,
- `cacheStatus`,
- `executionTarget`,
- `schemaVersion`.

## Review objective 12: Review testing gaps

Identify missing tests for:

- canonical path construction,
- locale normalization,
- variant normalization,
- `scenes.json` placement,
- manifest placement,
- cross-platform paths,
- path traversal prevention,
- workspace escape prevention,
- episode discovery,
- asset lookup,
- full versus short isolation,
- locale isolation,
- resume behavior,
- atomic writes,
- concurrent writers,
- cleanup safety,
- remote-sync include/exclude behavior,
- backward compatibility,
- migration of representative existing episodes.

Recommend a layered strategy:

- unit tests for pure path resolution,
- schema-validation tests,
- filesystem integration tests using temporary directories,
- workflow integration tests,
- migration tests using copied fixture folders,
- concurrency tests where necessary.

## Architectural constraints

The design must:

- use strict TypeScript,
- have one authoritative path-resolution layer,
- avoid hard-coded paths in business logic,
- separate path calculation from filesystem I/O,
- separate discovery from persistence,
- validate all persisted JSON,
- support schema evolution,
- preserve existing episodes during migration,
- support Linux local and Linux remote rendering,
- remain portable where practical,
- support resumable workflows,
- support batch API processing,
- support deterministic downstream discovery,
- minimize directory scans,
- avoid unnecessary breaking changes,
- avoid introducing a database solely for filesystem organization,
- avoid unrelated refactoring.

## Required proposed APIs

Propose concrete TypeScript APIs for the target architecture.

Include signatures and usage examples.

Improve on this illustrative shape:

type EpisodeId = string;
type LocaleCode = string;
type ContentVariant = 'full' | 'short';

interface EpisodeContext {
readonly episodeId: EpisodeId;
readonly locale: LocaleCode;
readonly variant: ContentVariant;
}

interface EpisodePathResolver {
episodeRoot(episodeId: EpisodeId): string;
episodeManifest(episodeId: EpisodeId): string;
localeRoot(context: EpisodeContext): string;
narrationScript(context: EpisodeContext): string;
scenesManifest(context: EpisodeContext): string;
audioFile(context: EpisodeContext): string;
transcriptFile(context: EpisodeContext): string;
renderManifest(context: EpisodeContext): string;
finalVideo(context: EpisodeContext): string;
thumbnailFile(context: EpisodeContext): string;
}

The proposed APIs must clearly separate:

- path calculation,
- path validation,
- workspace-boundary validation,
- directory creation,
- deterministic discovery,
- manifest loading,
- manifest validation,
- manifest persistence,
- atomic JSON writing.

Do not combine these into one god service.

## Migration requirements

Design a migration approach that preserves all existing generated episodes.

It must support:

- dry-run mode,
- operation report,
- collision detection,
- no destructive overwrite by default,
- backup or rollback mapping,
- resumable migration,
- verification after migration,
- old-to-new path mapping,
- manifest schema migration,
- ambiguous-file detection,
- manual-review report,
- per-episode migration,
- bulk migration,
- migration status persistence,
- safe reruns.

Propose commands such as:

npm run episodes:migrate-layout -- \
 --episode 009 \
 --dry-run

npm run episodes:migrate-layout -- \
 --all \
 --dry-run \
 --report ./migration-report.json

Do not implement the migration command in this task.

## Prioritization

Classify every finding as:

- Critical: may overwrite, lose, corrupt, or mix assets,
- High: causes downstream failure or incorrect localization,
- Medium: causes maintenance, portability, observability, or performance problems,
- Low: naming, documentation, or cleanup issue.

Prioritize:

1. cross-locale overwrites,
2. full/short collisions,
3. incorrect `scenes.json` placement,
4. manifest ambiguity,
5. non-deterministic asset discovery,
6. absolute paths in persisted state,
7. concurrent writes,
8. unsafe cleanup,
9. migration compatibility,
10. remote-render synchronization.

## Deliverables

Create:

docs/architecture/episode-filesystem-review.md

and:

docs/plans/episode-filesystem-refactor-plan.md

Do not modify production code.

Allowed repository changes:

- the two requested Markdown documents,
- optional supporting diagrams or inventories under `docs/`.

Not allowed:

- application-code changes,
- generated episode changes,
- manifest changes,
- configuration changes,
- dependency changes,
- lockfile changes,
- generated media,
- uploads,
- external API calls.

## Required contents of the architecture review

The review document must contain:

1. Executive summary
2. Repository areas inspected
3. Current filesystem map
4. Current data-flow map
5. Current producer/consumer matrix
6. Current `scenes.json` analysis
7. Current manifest analysis
8. Localization-model analysis
9. Confirmed defects
10. Suspected risks
11. Severity classification
12. Target filesystem structure
13. Target manifest model
14. Proposed TypeScript contracts
15. Path and naming invariants
16. Ownership and lifecycle matrix
17. Concurrency and atomicity strategy
18. Remote-rendering and rsync implications
19. Backward-compatibility strategy
20. Migration strategy
21. Testing strategy
22. Open questions
23. Recommended decisions

## Required contents of the implementation plan

Break the work into small dependency-ordered tasks.

Each task must include:

- task ID,
- title,
- objective,
- rationale,
- affected modules,
- expected files,
- implementation steps,
- data-contract changes,
- migration implications,
- backward-compatibility requirements,
- tests,
- acceptance criteria,
- rollback considerations,
- dependencies,
- parallelization notes,
- estimated risk: low, medium, or high.

Organize tasks into phases:

- Phase 0: repository inventory and safety baseline
- Phase 1: identifiers and schemas
- Phase 2: canonical path resolver
- Phase 3: filesystem and atomic-write utilities
- Phase 4: manifest separation and ownership
- Phase 5: scene-model cleanup
- Phase 6: generation workflow migration
- Phase 7: localization workflow migration
- Phase 8: rendering and remote-sync migration
- Phase 9: migration tooling for existing episodes
- Phase 10: compatibility period and deprecation
- Phase 11: cleanup and enforcement
- Phase 12: documentation and rollout

Identify:

- strict sequencing,
- tasks that may run in parallel,
- migration checkpoints,
- rollback points,
- compatibility gates.

## Review rules

- Inspect implementation before proposing the design.
- Cite concrete files, functions, classes, and line ranges where possible.
- Distinguish confirmed defects from suspected risks.
- Trace actual producers and consumers.
- Do not infer behavior only from filenames.
- Do not rename or move files.
- Do not modify generated assets.
- Do not run destructive commands.
- Read-only discovery commands are allowed.
- Focused type checks and tests are allowed.
- Do not run full media generation.
- Do not call external APIs.
- Do not upload content.
- Record assumptions explicitly.
- Prefer one coherent recommendation.
- Compare alternatives only where materially necessary.
- Keep working-tree changes limited to documentation.
- Run `git diff --check` before finishing.
- Run `git status --short` before finishing.
- Do not commit.
- Do not push.

## Final response

At the end, report:

1. active branch name,
2. most serious findings,
3. recommended target structure,
4. recommended placement and ownership of `scenes.json`,
5. recommended manifest model,
6. migration strategy,
7. ordered implementation phases,
8. files created,
9. unresolved architectural decisions,
10. final `git status --short`,
11. confirmation that no production code was changed,
12. confirmation that nothing was committed or pushed.

Do not begin implementation.
