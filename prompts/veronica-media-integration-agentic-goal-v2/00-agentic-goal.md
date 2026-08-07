# Agentic Goal — Veronica Supplemental Media Integration v2

## Mission

Implement a production-grade supplemental-media system for the Veronica Benini genre.

Users can supply:

- planned narration
- PDF documents
- PowerPoint presentations
- PNG/JPEG/WebP images
- SVG graphics
- optional MP4/MOV clips

The system must analyze narration and media together, revise narration when useful, select and place relevant media semantically, translate embedded text, adapt complex visuals for video, produce independent 16:9 and 9:16 compositions, and render deterministically with FFmpeg.

The implementation must be type-safe, auditable, resumable, cache-aware, observable, versioned, and compatible with all existing genres.

# 1. Reuse generic history-channel enhancements

Inspect current history visual-plan infrastructure first.

Reuse generic mechanisms only when stable and truly generic.

## 1.1 Versioned media plan

Create a versioned Veronica contract such as:

```text
veronica-media-plan.v1
veronica-media-planner.v1.x
```

or consume a repository-wide generic contract if one already exists and is stable.

Persist:

- schema version
- planner version
- prompt revision
- model/provider revision where relevant
- source checksums
- narration revision
- design-system revision
- renderer profile
- approval state

Never mutate old schemas in place.

## 1.2 Hard approval eligibility

Render eligibility must be machine enforced.

A plan must be ineligible when, for example:

- required supplied media failed extraction
- required visible text remains untranslated
- required provenance is missing
- mandatory media was silently substituted
- narration anchors cannot resolve
- portrait/landscape adaptation is invalid
- important text fails readability validation
- material low-confidence translation is unapproved
- required redesign is unresolved
- render-manifest validation fails
- required claim/source relationships are missing

Use typed stable error/warning codes.

## 1.3 Semantic anchors

Do not bind semantic planning primarily to timestamps.

Use:

- episode revision ID
- scene ID
- sentence/narration-anchor ID
- exact-text fallback
- semantic fingerprint fallback

Resolve final timestamps only after final TTS + alignment.

## 1.4 Multi-state / multi-shot planning

One source asset may create multiple visual states.

Example:

```text
slide 12
  → full-slide establishing shot
  → crop to graph
  → highlight one value
  → crop to quote
  → portrait reflow
```

Represent those states explicitly.

## 1.5 Asset reuse

Use content-addressed reuse for:

- originals
- extracted regions
- normalized assets
- translated variants
- redesigned variants
- landscape variants
- portrait variants
- intermediate clips

Reuse must remain tenant/episode safe.

## 1.6 Claim/source/provenance linkage

Link:

```text
spoken claim
    ↕
narration anchor
    ↕
source
    ↕
page / slide / region / clip
    ↕
prepared visual
    ↕
placement
```

Every derived asset must retain provenance.

At minimum:

- source asset ID
- original filename
- checksum
- page/slide/frame/time range
- source region
- extraction method
- transformation chain
- language
- attribution mode
- rights/ownership declaration when available
- confidence
- warning state

## 1.7 Deterministic diagrams and text-heavy visuals

Apply the history map-hardening lesson:

When correctness matters, do not rely on unconstrained generative image output.

For charts, tables, diagrams, text-heavy slides, annotated screenshots, and process graphics prefer:

```text
semantic representation
      ↓
structured layout
      ↓
prepared deterministic asset
      ↓
FFmpeg
```

## 1.8 Independent aspect-ratio planning

Treat 16:9 and 9:16 as separate compositions.

Defaults:

```text
16:9  → 1920×1080 @ 30fps
9:16  → 1080×1920 @ 30fps
```

Keep configurable.

Portrait adaptation may:

- split dense slides into focus shots
- reflow layout
- reconstruct as native portrait graphics
- frame landscape media where preservation is required

Never rely on center-cropping as the default solution.

## 1.9 Narration-duration contract

Track:

```text
original estimated duration
revised estimated duration
actual TTS duration
allowed variance
duration status
```

Reuse generic duration-validation infrastructure if stable.

Narration changes should preserve approximate runtime unless explicitly overridden.

## 1.10 Explicit fallback policy

For important placements model:

```text
required
preferred
optional
fallbackAllowed
fallbackAssetId
fallbackReason
```

Never silently substitute supplied media.

## 1.11 Approval-pack export

Generate a redacted portable review package containing:

- revised narration
- semantic plan
- claim/source mapping
- asset inventory
- prepared asset previews
- landscape contact sheet
- portrait contact sheet
- approval eligibility
- warnings/errors
- translations
- provenance
- checksums
- planner/schema versions

Do not expose secrets, credentials, local temp paths, or unnecessary internal prompts.

## 1.12 Bulk review extension

Design review-pack generation for later multi-episode aggregation:

```text
approval-packs/
  episode-a/
  episode-b/
  episode-c/
  aggregate-review.json
  cross-episode-findings.md
```

## 1.13 Planner quality metrics

Where repository conventions permit, add:

- supplied-asset utilization ratio
- unused high-relevance assets
- repeated-asset ratio
- fallback ratio
- approval-required ratio
- low-confidence placement ratio
- untranslated-text incidents
- portrait-adaptation failures
- narration-anchor resolution failures
- average visual dwell duration
- semantic coverage ratio
- redesign frequency
- cache-hit ratio

## 1.14 Regeneration boundaries

Support conceptual scopes:

```text
re-plan
re-prepare-assets
re-translate
re-align-narration
re-render
full-regeneration
```

Examples:

- crop override → prepare + render only
- glossary change → affected language assets + render
- narration wording change → re-plan/alignment as required
- bitrate change → render only
- unchanged content hash → reuse

# 2. Supplemental media workflow

## 2.1 Initial supported inputs

- PDF
- PPTX
- PNG
- JPEG
- WebP
- SVG
- MP4
- MOV

Suggested configurable defaults:

- 500 MB total input
- 150 PDF pages
- 100 presentation slides
- 50 retained visual candidates

Validate MIME, signatures, archive safety, path safety, and resource limits.

Never execute macros or embedded active content.

## 2.2 Narration modification

The planner may revise narration to improve:

- visual alignment
- clarity
- transitions
- redundancy
- explanation of supplied media
- localization

Preserve:

- thesis
- claims
- factual meaning
- tone
- approximate runtime
- traceability to original narration

Persist original/revised scripts and revision mapping.

## 2.3 Transformation levels

Support:

```text
preserve
adapt
redesign
summarize
```

Default to `adapt`.

All transformations must be traceable.

## 2.4 Localization

Use a language-neutral semantic source package and target-language derived assets.

Translate visible embedded text.

Use glossary/protected-term handling.

Require approval for:

- low-confidence translations
- quotations
- protected terminology
- material meaning changes
- unresolved layout overflow

# 3. FFmpeg rendering architecture

Separate:

```text
Semantic media plan
        ↓
Prepared render-ready assets
        ↓
Typed FFmpeg render manifest
```

FFmpeg is a compositor, not a PDF/PPTX layout engine.

Prepare complex visuals first as:

- raster assets
- transparent PNG layers
- sanitized/rendered SVG
- intermediate clips
- precomposed slide sequences

Minimum typed operations:

- contain
- cover
- deterministic crop
- pan
- zoom
- full-screen
- picture-in-picture
- split screen
- blurred background
- opacity fade
- simple transition
- overlay
- callout
- highlight
- sequential focus
- looped short video
- mute source audio
- approved source-audio excerpt with narration ducking

Reject arbitrary untrusted FFmpeg/filter strings.

Compile validated operations to safely escaped argument arrays.

# 4. Safe areas

Profiles must support:

- subtitle-safe area
- title-safe area
- lower-third-safe area
- platform-UI exclusion zone
- optional face-safe region
- branding-safe region

Validate landscape and portrait independently.

# 5. Type safety

Use strict TypeScript and runtime schemas.

Prefer repository-standard schema technology.

Create explicit discriminated unions / branded IDs for at least:

- SourceAsset
- ExtractedCandidate
- SourceReference
- ClaimReference
- NarrationScene
- NarrationAnchor
- NarrationRevision
- MediaPlacement
- VisualState
- PreparedAsset
- AspectRatioProfile
- TranslationStatus
- ApprovalStatus
- ApprovalEligibility
- ProvenanceRecord
- AttributionPolicy
- FallbackPolicy
- RenderOperation
- RenderManifest
- RegenerationScope
- StageResult
- EpisodeMediaPackManifest

Avoid ambiguous optional-field combinations.

# 6. Security

Mandatory protections:

- path traversal rejection
- archive-entry validation
- decompression-bomb protection
- macro/script non-execution
- SVG sanitization
- file-signature validation
- decoder/process timeouts
- bounded concurrency
- temporary job isolation
- safe process invocation
- no shell interpolation
- redacted logs
- deterministic cleanup
- manifest integrity checks
- tenant-safe cache keys

# 7. Observability

Structured logs/metrics should include safe identifiers:

- job
- episode
- genre
- stage
- asset
- language
- aspect ratio
- planner version
- schema version
- cache hit/miss
- status
- duration
- warning/failure code

Do not indiscriminately log extracted source text.

# 8. Genre isolation

Enable supplemental media initially only for Veronica Benini.

Shared changes must be:

- additive
- opt-in
- backward-compatible
- schema-versioned

History, horror, math, generic auto-genre, and all other genres must preserve existing behavior unless explicitly enabled.

# 9. Definition of done

Complete only when a representative Veronica fixture can:

1. ingest mixed media
2. revise narration with traceability
3. generate a versioned semantic media plan
4. link narration, claims, sources, and placements
5. produce hard approval eligibility
6. translate embedded text
7. generate distinct 16:9 and 9:16 plans
8. create multi-state visual sequences
9. resolve timestamps from final narration alignment
10. compile a typed FFmpeg manifest
11. render both aspect ratios
12. validate output
13. emit an approval pack
14. support explicit fallback behavior
15. support content-addressed reuse
16. calculate regeneration scope
17. expose planner-quality metrics
18. resume idempotently
19. preserve all non-Veronica behavior
20. pass independent final review
