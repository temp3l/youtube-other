# Episode Artifact Layout Migration

## Authority and write contract

`resolveArtifactPathSet()` is the path authority for typed `ArtifactRef` values. It returns one canonical artifact path, its sidecar manifest path, and ordered compatibility candidates. Every compatibility candidate has `mediaforge.legacy-artifact-layout.v1`, provenance, and `readOnly: true`.

`ArtifactRepository.promote()` is the canonical write boundary. It validates content, hashes it, writes durable temporary files, promotes without replacing an existing destination, and verifies the resulting manifest. `adoptCanonical()` exists only for migration of an unmanifested file already at the resolver-selected canonical path. Legacy sources are copied, never moved or modified.

## Canonical episode inventory

Templates are relative to `episodes/<unit>/`. `<l>` is locale, `<v>` is `full|short`, `<key>` is the typed artifact key, and `<profile>` is the render profile.

| Artifact kind        | Canonical template                                 | Producer                      | Primary consumers                      |
| -------------------- | -------------------------------------------------- | ----------------------------- | -------------------------------------- |
| source               | `source/<key>.<format>`                            | source ingestion              | rewrite, analysis                      |
| transcript           | `locales/<l>/<v>/transcript/<key>.json`            | transcription/cleaning        | rewrite, provenance                    |
| story-bible          | `canonical/story-bible.json`                       | story workflow                | rewrite, visual planning               |
| reference-manifest   | `shared/references/manifest.json`                  | visual/image planning         | image generation, render QA            |
| full-script          | `languages/script-<l>.md`                          | rewrite/localization          | speech, analysis, scenes, metadata     |
| short-script         | `languages/short/script-<l>.md`                    | Short derivation/localization | Short speech, scenes, render, metadata |
| scene-plan           | `visuals/<v>/scene-plan.json`                      | scene planning                | images, alignment, render, metadata    |
| shot-plan            | `state/visual-retention/shot-plan.<v>.<l>.json`    | visual planning               | rendering                              |
| image                | `visuals/<v>/images/<key>.<format>`                | image generation              | rendering, QA                          |
| thumbnail            | `locales/<l>/<v>/thumbnails/<key>.<format>`        | thumbnail generation          | publishing                             |
| narration            | `locales/<l>/<v>/audio/<key>.<format>`             | speech                        | alignment, rendering                   |
| captions             | `locales/<l>/<v>/captions/<key>.<format>`          | alignment                     | rendering, publishing                  |
| render               | `locales/<l>/<v>/renders/<profile>/<key>.<format>` | rendering                     | QA, publishing                         |
| metadata             | `locales/<l>/<v>/metadata/<key>.json`              | metadata                      | publishing                             |
| publish-report       | `state/upload/<l>/<v>/<key>.json`                  | YouTube dry-run/publish       | operators, reconciliation              |
| quality-assessment   | `state/quality/<l>/<v>/<key>.json`                 | story/media validators        | workflow gates                         |
| source-manifest      | `sources/manifests/<key>.json`                     | source ingestion              | provenance, orchestration              |
| episode-blueprint    | `blueprint.json`                                   | episode planning              | orchestration                          |
| provenance-report    | `locales/<l>/<v>/provenance/<key>.json`            | provenance assembly           | review, publishing                     |
| composition-plan     | `locales/<l>/<v>/composition/<key>.json`           | composition planning          | speech/rendering                       |
| audio-track-manifest | `locales/<l>/<v>/audio/tracks.json`                | speech assembly               | rendering, delivery                    |
| capability-report    | `locales/<l>/<v>/capability-reports/<key>.json`    | capability validation         | workflow gates                         |
| multilingual-package | `locales/<l>/<v>/packages/<key>.json`              | packaging                     | delivery                               |
| publish-package      | `locales/<l>/<v>/packages/<key>.json`              | packaging                     | publishing                             |

Strategic Reinvention overrides only `source`: canonical content is `sources/content/<key>/<key>.<format>`. Mathematics uses its own versioned adapter and is outside the episode-layout command.

## Declared legacy inventory

| Artifact                  | Read-only candidates                                                                                                  | Provenance                                                                | Historical producers                                     | Active compatibility consumers                                                        |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- | -------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| full script               | `locales/<l>/full/script.md`; `<l>/full/script.md`; `<l>/script.md`; `source/<unit>-<l>-full.md`; English `script.md` | generated locale/language runtime, authored compatibility, source lineage | story localization, full rewrite, older episode commands | artifact repository, layout migration; older direct story/audio callers pending gates |
| Short script              | `locales/<l>/short/script.md`; `<l>/short/script.md`; `source/<unit>-<l>-short.md`                                    | generated locale/language runtime, source lineage                         | Short rewrite/localization                               | artifact repository, layout migration; older Short/audio callers pending gates        |
| full image                | `shared/images/generated/<key>.<format>`; `state/image-generation/images/<key>.<format>`                              | shared output, generation state                                           | synchronous/batch image generation                       | rendering and repair adapters pending gates                                           |
| Short image               | `shared/short/images/generated/<key>.<format>`; `images/generated/<key>.<format>`                                     | shared output                                                             | Short image strategies                                   | rendering and repair adapters pending gates                                           |
| narration                 | `languages/<l>/<v>/<key>.<format>`                                                                                    | generated language runtime                                                | legacy narration                                         | speech/render compatibility                                                           |
| scene plan                | `canonical/scenes.json`; `shared/scenes.json`                                                                         | canonical scene compatibility                                             | older scene/image planners                               | image/render/metadata compatibility                                                   |
| strategic source          | flat files under `sources/content/` and `sources/`                                                                    | strategic source compatibility                                            | earlier strategic commands                               | strategic source import                                                               |
| strategic source manifest | `sources/<key>.manifest.json`                                                                                         | strategic source compatibility                                            | earlier strategic commands                               | strategic source import                                                               |

Paths not declared by the resolver are reported as `stale_unsupported_layout` and cannot be migrated. A manifested canonical and any manifested legacy candidates are hash-checked together; differing valid content raises `ARTIFACT_AMBIGUOUS`.

## Migration command

Dry-run is the default and performs no writes:

```bash
node apps/cli/bin/mediaforge.js episode migrate-layout \
  --episodes-root episodes --profile veronicabenini --json
```

Write mode re-plans, rejects every blocked target, and requires the exact dry-run ID:

```bash
node apps/cli/bin/mediaforge.js episode migrate-layout \
  --episodes-root episodes --profile veronicabenini \
  --write --confirm <migration-id> --yes --json
```

For a legacy-only authored or source-lineage target it copies bytes through `ArtifactRepository.promote()`, writes the canonical sidecar manifest, and leaves the legacy source unchanged. A generated-runtime script alone is blocked and requires authored-source classification. For an unmanifested canonical target it writes only the manifest through `adoptCanonical()`. Rollback metadata is stored under `state/artifact-migrations/<plan-id>.rollback.json` before promotion and binds the source, destination, and SHA-256.

## Representative characterization, 2026-08-10

The read-only Veronica dry-run covered `l01-s01`, `l01-s02`, `l01-s03`, and `l02-s01`. It found 10 Short locale targets: all canonical scripts existed without artifact manifests, all declared `locales/<locale>/short/script.md` candidates were normalized-hash equivalent, and no target was blocked. Planned result: `write-manifest: 10`, `copy: 0`, `skip: 0`, `block: 0`. No episode files were changed.

Tests also characterize the historical `022-the-whistler-in-the-woods` canonical-plus-root duplicate, `009-mary-gloria-the-christmas-doll` divergence, a legacy-only source-lineage copy, an unsafe target collision, full/Short render separation, and manifest adoption.

## Legacy adapter removal gates

Do not remove a candidate or direct compatibility adapter until all gates pass:

- the repository search has no active direct producer writing that path;
- dry-run has no unexplained `block` or unsupported active candidate;
- every canonical artifact has a valid matching manifest;
- representative full, Short, and multilingual episodes resolve without fallback;
- focused resolver, migration, render, and packaged-CLI tests pass;
- rollback metadata has been retained for the accepted support window;
- operator acceptance and docs name the canonical replacement.

Current status: not passed. The 2026-08-10 dry-run still requires 10 manifest adoptions, and direct image/render compatibility consumers remain. No legacy adapter is removed by this change.
