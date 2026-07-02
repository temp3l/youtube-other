# Executive Summary

## What legacy means here

The removable legacy system is the older local-first media repurposing pipeline centered on `@mediaforge/pipeline`, root CLI commands in `apps/cli/src/index.ts` such as `create`, `run`, `status`, `inspect`, and `retry`, and `apps/api/src/index.ts` booting `createPipeline()`. It also includes overlapping media orchestration in `@mediaforge/dark-truth` where it duplicates active application orchestration for source discovery, narration, image generation, audio slicing, rendering, and review packaging.

The active Dark Truth system is the story-production workflow exposed through `apps/cli` story and episode commands and implemented by `@mediaforge/story-localization`, `@mediaforge/speech`, `@mediaforge/image-generation`, `@mediaforge/rendering`, `@mediaforge/metadata`, `@mediaforge/youtube-upload`, and shared domain/path/config packages.

## Scope of removal

Remove legacy entry points, duplicate orchestration, compatibility adapters, legacy path construction, stale docs, obsolete tests, and dependencies that are proven unused by active Dark Truth flows. Do not delete production data automatically.

## Path problems found

Active and generated episode workspaces contain conflicting script locations:

- `episodes/<slug>/languages/script-en.md`
- `episodes/<slug>/languages/script-de.md`
- `episodes/<slug>/script.md`
- `episodes/<slug>/en/script.md`
- `episodes/<slug>/en/full/script.md`
- `episodes/<slug>/<language>/<variant>/script.md`
- staged generated outputs under `episodes/<slug>/locales/<locale>/<variant>/...`

Episode `022-the-whistler-in-the-woods` currently contains root, `en/script.md`, `en/full/script.md`, `de/full/script.md`, and `languages/script-{en,de}.md`, so first-match lookup is unsafe.

## Proposed canonical layout

Authored full scripts:

```text
episodes/<episode-slug>/languages/script-<language>.md
```

Authored Short scripts, when distinct from full scripts:

```text
episodes/<episode-slug>/languages/short/script-<language>.md
```

Generated stage outputs stay under resolver-owned locale/variant roots and must not become authored-source inputs.

## Highest risks

- Duplicate scripts may have divergent content.
- Existing CLI wrappers assume root `script.md` or `<language>/<variant>/script.md`.
- Cache keys and resume manifests can collide if language and variant are not first-class.
- `apps/api` still boots the old `@mediaforge/pipeline`.
- Some docs already describe compatibility projections as canonical.

## Target state

One Dark Truth-focused application boundary remains:

```text
CLI / API / worker
-> typed application command
-> central script resolver
-> pipeline orchestration
-> domain and infrastructure services
```

No active stage reconstructs script paths manually. Legacy imports, commands, package exports, route wiring, compatibility script copies, root `script.md` assumptions, and obsolete docs are removed or classified.

## Unresolved uncertainties

- Whether every committed duplicate script is identical; implementation must compare hashes before migration.
- Whether external users depend on legacy root CLI commands or package exports.
- Whether production SQLite rows, remote render job folders, and generated episode outputs contain legacy-only state that operators want archived.

## Planning status

READY_WITH_BLOCKERS: implementation is possible, but branch/file creation should be reviewed with the dirty worktree and duplicate-script migration inventory before destructive removal begins.
