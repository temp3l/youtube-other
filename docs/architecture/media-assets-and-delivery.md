# Media Assets And Delivery

## Scope

This document covers the operational path after scripts and scene plans exist: image generation and ownership, rendering, metadata generation, YouTube upload, and telemetry.

The active downstream media path is:

```text
validated narration
  -> scene plan
  -> image plan
  -> generated or reused images
  -> render
  -> thumbnail
  -> publication
```

Full and short media stay separate. Metadata and audio remain sibling or downstream concerns with independent ownership.

## Image Planning, Generation, Import, and Validation

- Scene plans are treated as explicit downstream artifacts of validated narration, with narration fingerprint, locale, variant, and planning configuration recorded in the persisted visual-plan artifacts.
- Image prompts are generated from scene plans with local style and negative-prompt helpers.
- Shared image ownership lives under episode-level shared directories, with migration-only stale image candidates classified by shared helpers where older state still needs inspection.
- Canonical shared scene-image specs are exact and variant-specific: full-video generated images must be `1536x864`, short-video generated images must be `864x1536`.
- Final render specs stay separate from generation specs: full-video renders are `1920x1080`, short-video renders are `1080x1920`.
- `OPENAI_IMAGE_SIZE` is only the backward-compatible fallback for full-video generation. Short generation must come from `OPENAI_IMAGE_SHORT_SIZE`, `YOUTUBE_SHORT_IMAGE_SIZE`, or the typed default `864x1536`.
- Using `1920x1080` as the default OpenAI request size is incorrect for the story pipeline because it conflates provider image generation with downstream video rendering and weakens manifest reuse validation.
- The image pipeline persists prompts, visual plans, provider request and response artifacts, manifests, checkpoints, and failure records under `state/image-generation/`.
- Image-generation manifests now record additive stage dependencies for narration, scene-plan, and image-plan lineage, plus prompt and configuration fingerprints.
- Resume and reuse behavior are manifest-driven, but file existence alone is not accepted as valid. The pipeline inspects the actual image file and fails fast when the stored dimensions do not match the canonical spec for that variant.
- `images plan` is a cost preflight: it reports the provider-call upper bound, cache hits, intentional visual reuse, and blocked scenes without replacing valid generated manifests.
- Episode-wide forced image regeneration is rejected. Paid force operations must name one scene; ordinary resume targets only missing, invalid, or retryable scene identities.
- Full-image generation uses a ten-second visual-cadence target when budgeting semantically valid reuse. Superseded scene filenames move to `state/image-generation/superseded-assets/`; content-addressed cache records remain intact.
- Full-video rendering treats an existing scene generation manifest as authoritative. The manifest must be generated, point to a current scene-plan candidate, and match the file hash; failed or stale manifests cannot fall through to legacy files.
- Short image preparation keeps the short variant separate, requires `9:16`, records safe vertical composition, focal-subject placement, text-safe guidance, and optional parent full-video linkage in the shorts manifest, and validates the stored portrait generation asset at `864x1536` before rendering.
- Localized full-video runs reuse canonical shared full images only after the shared manifest entries and the actual files on disk pass the same dimension contract.
- Recovery for invalid existing assets: rerun only the affected scene identity. The pipeline quarantines superseded full-image filenames while retaining reusable cache records. Do not keep rendering from a manifest that points at invalid files.
- If an older episode already contains `1920x1080` full shared images or `1080x1920` short shared images in the image manifest, treat them as invalid generation assets, remove the manifest entries and files, and resume the image stage so the pipeline regenerates or revalidates against the correct generation size.

## Rendering

- Rendering is `ffmpeg`-based and can operate locally or through a remote SSH plus `rsync` worker.
- Canonical private math lessons render verified facts through semantic board components rather than generic text cards. The component set includes lesson boards, fact stacks, interactive place-value activities, place-value charts, focused number lines, geometry diagrams, and tally tables; unsupported planned components fail closed.
- `math-semantic-chalk.v7` writes supported SVG text as single-line vector glyph strokes, reveals one grapheme and one pen stroke at a time, and gives pending glyphs no paintable geometry. Completed writing remains centerline-based with deterministic hand variation, a displaced dust pass, and chalk dropout. Geometric marks also use path-length drawing. It never uses a rectangular text clip; nested or unsupported text uses a token-local grain fallback.
- The math keyframe renderer supports weighted chalk beats and bounded pauses for natural writing cadence, gives challenge scenes an eight-second silent countdown followed by a deterministic local reveal cue, and persists content-addressed raster and per-scene video caches so an interrupted render can resume without regenerating speech. Raster work runs in scene-bounded, single-worker subprocess batches with validated PNG checkpoints and an atomic progress manifest, keeping process lifetime and memory bounded. Place-value review boards keep the complete challenge answer hidden until the solution scene.
- Production math renders do not burn the persistent bottom caption bar. Captions remain separate locale artifacts; burn-in is an explicit debug/review option.
- Canonical paid German narration is locked by `math-narration-approved-v1`: `gpt-4o-mini-tts`, voice `marin`, provider speed `0.9`, `education-natural-teacher.v1`, 48 kHz mono PCM mastering at −17 LUFS and −2 dBTP, with a 300-second target and 3% duration tolerance.
- Visual-only invalidation follows dependency branches: chalk or visual-asset changes invalidate render and visual reports but preserve valid TTS and timing evidence.
- Draft, review, and publish encoding profiles are explicit. Publish uses H.264 CRF 18 with the slow preset, yuv420p, 30 fps, and 192 kb/s AAC.
- Repository-local private math workspaces are restricted to the ignored `.cache/math-pipeline/` tree; tracked source and episode paths remain invalid workspace targets.
- Canonical math final-media evidence records whether planned components were realized, whether a generic fallback was used, narration-cue coverage, minimum scene-step count, and maximum static interval. The private quality gate requires this visual evidence to pass.
- The complete math production contract enumerates full and Short video, thumbnails, separate captions, differentiated worksheet and answer-key data/PDFs, quiz data, metadata, curriculum evidence, quality, publishing, and workflow state. Grade/grade-band and locale hashes are required on these contracts.
- Content and publication approvals are separate, hash-bound, lesson-and-locale-specific records. Publication fails closed for stale approval, unresolved audience settings, missing native assets, incomplete private upload, or failed remote verification.
- Worksheet/quiz distribution uses the `ArtefactDistributionProvider` boundary with stable content-addressed keys; answer keys remain private by default. Generated resource links update only the delimited managed description block.
- Scene clip manifests record hashes, render profile details, and renderer provenance for resumability and validation.
- Final render manifests are explicit downstream `render` artifacts. They are variant-aware, preserve upstream dependency fingerprints, and enforce `youtube` for full outputs versus portrait `vertical` for shorts.
- Thumbnail generation is a separate `thumbnail` ownership stage under locale plus variant roots. Full thumbnails are exact `1536x864`; short thumbnails are exact `864x1536`.
- Thumbnail manifests sit beside the image output at `locales/<locale>/<full|short>/thumbnails/thumbnail.manifest.json` and record prompt plus source fingerprints, quality, model, text strategy, output hash, request id, and estimated cost metadata.
- Default thumbnail text handling is post-rendered localized typography, so operator-supplied hook text stays exact and deterministic even when the base image is model-generated.
- Remote rendering is optional. When enabled, the hybrid renderer can retry remote work and fall back to local rendering if configured.
- Native-local rendering remains the default. A render-ready canonical math lesson persists a strict provider-free benchmark input beside its render output. `math renderer benchmark` copies only hash-validated SVG and narration files into artifact-local working roots, runs native-local, local-container, remote-container, and hybrid cold/warm cases, and never replaces canonical media. Math render staging, calibration, and deployment work stays under the selected workspace or repository-local `.cache/math-pipeline`; the renderer does not implicitly use the system temporary directory.
- The versioned benchmark artifact records client wall time, scene assignments and intervals, predicted/actual work, assembly, local QA outcome, cache and transfer measurements, resource availability, immutable toolchain identity, overlap evidence, and the warm acceptance ratio. An unavailable measurement is distinct from zero. Host addresses, absolute paths, narration content, and secrets are excluded by schema.
- Hybrid is recommendable only when the warm client-wall ratio is at most `0.80` and the warm hybrid run proves actual local/remote overlap. Otherwise the artifact keeps `local` as the configured recommendation. Benchmarking reports slot candidates; it does not modify environment configuration.
- Final outputs are validated for expected media characteristics before the pipeline treats them as complete.
- Render failures do not invalidate narration, scene plans, or completed image artifacts.
- The CLI exposes `render remote check` for remote host preflight, `render remote verify` and `render remote test` for a deterministic remote render probe, `render remote status` for job summaries, `render remote logs` for per-job or per-clip log retrieval, and `render remote cleanup` for stale workspace removal.
- `render remote status` reads remote job state from `<REMOTE_RENDER_BASE_DIR>/jobs` over SSH and summarizes clip metadata, counts, and optional tailed log excerpts.
- `render remote logs` expects a job id and can narrow output to a single clip with `--clip` and a tail length with `--tail`.
- Math renderer deployment receipts store only a one-way target fingerprint. CLI deployment, preflight, status, logs, and benchmark output do not expose the remote address or local filesystem paths.

## Metadata

- YouTube metadata is generated from scenes files rather than from free-form episode notes.
- The metadata package writes JSON, markdown, description, chapters, tags, pinned-comment, and generation-info outputs.
- Metadata generation supports retries, fallback models, timeout control, and optional retention of uploaded source files.

## YouTube Upload

- Upload is a separate terminal publication boundary after render, metadata, and thumbnail artifacts exist.
- The upload package validates metadata, resolves locale-specific channel credentials where configured, and writes upload reports plus markdown summaries.
- Publication reports now record variant-aware render and thumbnail dependencies, publication fingerprints, and retry-safe request identity without persisting OAuth secrets.
- Failure classes are explicit: configuration errors, validation errors, duplicate uploads, and generic upload errors with retryability attached where appropriate.
- Upload failures update only the publication report and do not invalidate narration, scene planning, image generation, or completed renders.

## Telemetry and Redaction

- Root npm scripts wrap the CLI with `scripts/run-with-telemetry.mjs`, which emits structured start and end events.
- Package logging uses Pino with redaction for API keys, authorization fields, cookies, access tokens, and signed URLs.

## Source References

- `packages/image-generation/src/index.ts`
- `packages/image-generation/src/episode-image-pipeline.ts`
- `packages/rendering/src/index.ts`
- `packages/metadata/src/youtube-metadata.ts`
- `packages/youtube-upload/src/index.ts`
- `packages/observability/src/index.ts`
- `scripts/run-with-telemetry.mjs`
