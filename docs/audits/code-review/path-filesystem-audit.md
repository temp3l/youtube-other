# Path and Filesystem Audit

## Manual Path Construction Hotspots

- `packages/story-localization/src/canonical-full-story.persistence.ts:203` builds generated English full paths as `<episode>/en/full/script.md`.
- `packages/story-localization/src/story-localization.service.ts:1926` builds generated localized paths as `<episode>/<language>/<variant>/script.md`.
- `apps/cli/src/story-full-rewrite-command.ts:177` and `apps/cli/src/story-localization-commands.ts:212` expose those layouts in dry-run/planning output.
- `packages/story-localization/src/short-rewrite.resolution.ts:196` searches `script.md`, `en/full/script.md`, and recursive `script.md` candidates.
- `packages/rendering/src/index.ts:2229` scans image directories for scene image matches.
- `packages/youtube-upload/src/index.ts:815` scans render/output directories for `.mp4` files.

## Unsafe Filesystem Operations

- `packages/shared/src/episode-filesystem.ts:959` and `:996` join caller-provided `expectedFilename` values directly.
- `packages/rendering/src/index.ts:2361` allows absolute shot source image paths.
- `packages/rendering/src/index.ts:2466`, `:2730`, `:2731`, and `:3836` remove render/cache artifacts; these should remain contained by resolver-owned paths.
- `apps/cli/src/render-remote-shell.ts:21` uses remote `find ... -exec rm -rf`; guard remote base directories and test cutoff expansion.

## Stale Path Assumptions

Confirmed active references:

- `episodes/<slug>/script.md`
- `episodes/<slug>/en/full/script.md`
- `episodes/<slug>/<language>/full/script.md`
- `episodes/<slug>/<language>/short/script.md`
- `episodes/<slug>/locales/<locale>/<variant>/...`
- `episodes/<slug>/languages/<locale>/<variant>/...`
- `episodes/<slug>/languages/script-<locale>.md`
- `episodes/<slug>/languages/short/script-<locale>.md`

These are not all wrong, but they need ownership labels. The riskiest overlap is authored source scripts versus generated narration scripts.

## `script.md` Assumptions

- Shared authored resolver rejects stale root and language-folder `script.md` paths.
- Story rewrite/localization still writes and tests compatibility `script.md` outputs.
- Short rewrite discovery still searches recursive `script.md` files.

Treat every raw `script.md` read as a path-resolution risk unless it is behind an explicit generated-script or legacy-compatibility API.

## Localized Script Assumptions

Current models:

- Authored full: `episodes/<slug>/languages/script-<locale>.md`
- Authored short: `episodes/<slug>/languages/short/script-<locale>.md`
- Generated/runtime: `episodes/<slug>/locales/<locale>/<variant>/script.md`
- Shared localized artifacts: `episodes/<slug>/languages/<locale>/<variant>/script.md`
- Legacy/generated compatibility: `<episode>/<locale>/<variant>/script.md`

The naming makes it easy to choose the wrong helper.

## Output Folder Inconsistencies

- Render outputs live under locale variant roots.
- Shared generated images live under `shared/images/generated` and `shared/short/images/generated`.
- Batch state lives under `state/image-generation/.batch`.
- Upload can still read root `output`.
- Built `dist` exists across workspaces and should not be assumed current after source changes.

## Resolver Recommendations

- Introduce or enforce one `EpisodeWorkspace` resolver object that names: `authoredScript`, `generatedScript`, `localeRuntimeRoot`, `sharedVisualAsset`, `renderArtifact`, `uploadArtifact`, and `legacyCompat`.
- Add containment checks to helpers accepting filenames.
- Make scans return structured `legacyFallbackUsed` metadata.
- Add characterization tests for canonical `languages/script-<locale>.md` and generated `locales/<locale>/<variant>/script.md` paths before changing behavior.

