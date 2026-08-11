# Veronica Supplemental Media Overview

Veronica Benini (`strategic-reinvention` genre) supplemental media is implemented in `@mediaforge/veronica-media` as an opt-in, genre-isolated workflow.

## Pipeline

```text
Uploaded narration + supplemental media
        ↓
Secure source inventory (`ingestion/secure-ingest.ts`)
        ↓
Versioned semantic media plan (`veronica-media-plan.v1`)
        ↓
Claim / source / narration linkage
        ↓
Approval eligibility gate (`approval/eligibility.ts`)
        ↓
Language-specific preparation
        ↓
Independent 16:9 + 9:16 compositions
        ↓
Typed deterministic FFmpeg render manifest (`rendering/compiler.ts`)
        ↓
Render + validation + approval pack
```

## Entry points

- Library: `runVeronicaSupplementalMediaPipeline`
- CLI: `mediaforge veronica-media pilot --workspace <dir>`
- Fixture: `createVeronicaPilotFixtures()`

## Genre isolation

Only explicit Veronica/strategic-reinvention workflows invoke this package. Other genres preserve existing behavior.

## Pre-image semantic readiness

Canonical code owns scene segmentation, narration-grounded propositions, visual
treatments, polarity, actor/action ownership, evidence, continuity, references,
format, timing, hashes, invalidation, and readiness. Production persists strict
`visual-treatments.v1.json` and `visual-bible.v1.json` artifacts. The latter resolves
`content-packs/veronica-character-reference-v1` as identity authority while keeping
episode wardrobe, pose, environment, lighting, and framing separate.

The final provider prompt is a deterministic projection of the immutable treatment,
visual direction, resolved references, provider policy, aspect ratio, and subtitle
safe area. Semantic invention remains upstream; the compiler performs no model call
and cannot reinterpret the scene.

Compilation identity includes semantic, treatment, visual-bible, format, continuity,
reference, provider-constraint, and compiler-version dependencies. Unchanged assets
are reused per scene and never patched or merged with legacy prose. Validation blocks
schema, provenance, actor, polarity, state, evidence, placeholder, and internal-
language defects before the source-fidelity judge receives the exact prompt.
Sequence QA remains separate.

### Visual beats

Veronica Shorts may resolve one semantic scene treatment into one or more typed
`VisualBeatTreatmentV1` records. Semantic scenes still own narrative meaning;
visual beats express bounded internal progression and pacing. Each beat records its
role, explicit new information, visible action/state, composition, reference requirements, asset decision,
and whether its boundary is narration-aligned, semantic-subspan-aligned, or
editorially allocated.

Provider prompts, prompt provenance, canonical cache identity, and timed visual
events are beat-scoped. Timing provenance is recorded but excluded from image
identity, so locale retiming preserves canonical assets. Beat decisions distinguish
`new-image`, `reuse-with-motion`, `reuse-with-crop`, and `reuse-existing-asset`.
Existing episodes remain compatible through an implicit single beat per scene.
Deterministic density QA measures unique canonical assets rather than event count,
including opening image changes, repeated-asset events, continuous same-image holds,
and information gain for every paid-image candidate. Multiple crop or motion events
against one asset therefore cannot be reported as increased image density.

Source-grounded QA remains hierarchical. Parent semantic scenes are judged first;
each `new-image` beat is then independently judged against its narration evidence,
parent semantics, adjacent beats, and exact provider prompt. The sequence judge
receives the ordered beat sequence when a beat plan exists. Scene PASS, every
required beat PASS, beat-sequence PASS, deterministic provider-prompt PASS, and
explicit human approval are all non-compensatory generation gates. Beat cache
identity includes narration, parent scene and treatment, beat semantics, prompt,
adjacency, model, and QA policy; timing is intentionally excluded.

For an approved episode, `mediaforge veronica-media plan-visual-density --workspace
<episodes-dir> --episode-id <id> --overrides <visual-beat-overrides.v1.json>` performs
a no-image planning dry run and retimes every locale that already has selected audio.

The former OpenAI prompt rewrite and the older deterministic assembler are
compatibility-only. Review evidence records compiler input/result, full prompt,
hashes, remediation, QA, and same-snapshot status. Passing automation never records
human approval or permits an image-provider request.

Every prepared locale/variant persists the exact provider prompt set in the episode
at `locales/<language>/<variant>/image-prompts/provider-image-prompts.v1.json` and
`provider-image-prompts.md`. The manifest records both artifacts and checksums.
Planning-only and audio-backed pre-image review packs include byte-identical copies;
pack creation fails closed if the persisted artifact is missing, stale, or corrupt.

## Localization and visual reuse

English owns the master semantic plan, treatments, bible, provider prompts, and
canonical images. Each non-English production requires that master plan, maps its
narration back to the unchanged semantic scene order, and gives its own selected WAV
exclusive ownership of locale timing. Preparation emits localized alignment,
caption, visual-event, render-readiness, publish-readiness, and lineage artifacts.

Locale wording, audio, timing, captions, metadata, and render changes do not alter
canonical image cache keys. Only an explicit typed locale visual override can do so,
and then only for the affected scene. Generated readable text remains forbidden;
localized text belongs to captions and render-time overlays. The existing shared-
visual renderer and YouTube metadata/upload paths consume these artifacts after
canonical images, human approval, and render validation exist.
