# Task 09 Plan: Short Adaptation Contract and Beat Extraction

## 1. Objective and Scope

Task 09 inserts a deterministic, matching-locale short-source extraction layer between validated full artifacts and short generation. Its purpose is to stop short generation from depending on full-story markdown or ad hoc compatibility reconstruction, and to replace that with a compact adaptation contract that preserves the facts a short must keep while allowing controlled compression.

This task owns:

1. deterministic short-source extraction; and
2. the compact short adaptation contract.

It does not own short prompt compilation, provider generation, fragment repair strategy, or broader retry frameworks. Those are Task 10 concerns. It also does not redesign canonical full generation, generic preflight, or generic prompt fingerprinting.

Task 09 depends on Task 08’s localized-full lineage rules. Rather than repeating shared architecture, this plan assumes the Task 08 shared baseline section is already established: validated canonical English full artifacts back English shorts, and validated matching-locale localized full artifacts back localized shorts.

Required lineage for this task:

`validated matching-locale full -> deterministic extraction -> compact short adaptation contract`

## 2. Current Short Input Resolution and Lineage

The current short flow is split across:

- `short-rewrite.resolution.ts`
- `short-rewrite.service.ts`
- `short-rewrite.prompt.ts`
- `story-prompt-compiler.ts`

### What currently works

- `resolveShortRewriteInput(...)` requires generated-full provenance by default and rejects obvious short inputs.
- Explicit compatibility mode exists through `allowSourceInput` / `--compatibility-source`.
- Resume behavior already compares `promptFingerprint`, source hash, target language, and model when deciding whether an artifact can be reused.

### What currently does not satisfy the task

Current short generation still reconstructs a pseudo-English source object and passes the entire full story text into the short compiler path:

- `compileShortStoryPrompt(...)` receives `fullStoryText`
- prompt assembly injects `<FULL_LOCALIZED_STORY> ... </FULL_LOCALIZED_STORY>`
- `parentArtifact` in short preflight is always `canonical-english-full`
- short artifacts and manifests persist `sourceSha256` but not matching-locale parent identity/hash

This means today’s short flow is provenance-aware at input selection time, but not contract-driven at prompt-construction time.

## 3. Confirmed Defects

| Defect | Evidence | Impact |
| --- | --- | --- |
| Short compiler receives full story payload | `story-prompt-compiler.ts` | Prompt is larger than necessary and mixes generation with extraction |
| Localized short does not require matching-locale localized parent | `short-rewrite.service.ts`, `story-generation-preflight.ts` | Wrong-locale or English parent can leak into localized short flow |
| Preflight parent descriptor is always canonical English full | `short-rewrite.service.ts` | Localized short lineage is under-specified |
| Short persistence lacks parent hash/fingerprint | `short-rewrite.schemas.ts`, `short-rewrite.types.ts` | Resume/invalidation cannot track full-parent drift |
| No deterministic extraction artifact or contract hash exists | current short path | Cannot suppress unchanged failed requests on the true short input basis |
| Compatibility mode is still structurally central | `short-rewrite.prompt.ts` | Canonical short path still depends on legacy shaping |

## 4. Deterministic Short-Source Extraction

Task 09 should add a deterministic extractor that consumes a validated full parent artifact and produces a materially smaller, stable short-source representation.

### Extractor inputs

For English short:

- validated canonical English full artifact
- associated StoryIR/hash lineage already persisted by Task 07

For localized short:

- validated matching-locale localized full artifact from Task 08
- parent canonical lineage transitively available through that artifact

### Extractor outputs

The extracted payload should include only short-relevant material:

| Category | Included content |
| --- | --- |
| Identity | story identity, protagonist/subject |
| Setting | essential setting context |
| Core logic | central threat or mystery, central rule or mechanism |
| Critical object | object that must survive compression |
| Escalation | essential beats only |
| Culmination | climax or irreversible turn |
| Ending | final consequence or sting |
| Textual invariants | exact written messages, required identifiers |
| Compression guidance | removable characters/subplots, compression-safe dialogue |
| Risk markers | possible orphaned references |

### Determinism requirements

- stable beat or segment IDs;
- stable ordering;
- stable extraction hash from normalized content;
- no provider calls;
- no reuse of free-form diagnostics as input data.

The extractor should be a pure transformation of validated full artifact content plus existing StoryIR/full-contract evidence.

## 5. Compact Short Adaptation Contract

The short adaptation contract should be built from the deterministic extraction and stored as the canonical short-generation input boundary.

### Required contract fields

| Category | Required field |
| --- | --- |
| Parent | matching-locale validated parent identity |
| Parent | matching-locale validated parent fingerprint/hash |
| Narrative basis | `storyIrHash` |
| Locale | target locale |
| Immutable content | immutable facts and required entities |
| Plot core | threat, mechanism, critical object |
| Arc | culmination and ending |
| Textual invariants | written messages and identifiers |
| Compression policy | permitted compression, forbidden omissions, removable material |
| Dialogue policy | compression boundaries |
| Invention policy | invention boundaries |
| Output constraints | target duration, WPM, word range, hook deadline, maximum beats |
| Versioning | extractor version, contract version |
| Fingerprints | content hash and build fingerprint |

### Explicit exclusions

The contract must not include:

- metadata, SEO, tags, hashtags;
- audio/TTS instructions;
- scenes, images, rendering, publication;
- validation diagnostics;
- repair history;
- full provider payloads;
- full-story markdown when extraction already captures the required content.

That exclusion list matters because current short prompts still inherit too much non-short context.

## 6. Parent Validation and Compatibility Behavior

Parent validation rules should be strict by default.

### Canonical behavior

- English short requires a validated canonical English full parent.
- Localized short requires a validated matching-locale localized full parent.
- Wrong-locale parent is rejected.
- Raw source, cleaned source directly, another locale’s full, another short, metadata, audio, scenes, images, or legacy combined markdown are rejected when a canonical matching parent exists.

### Compatibility behavior

Existing explicit compatibility mode may remain, but only as opt-in behavior:

| Rule | Required behavior |
| --- | --- |
| Legacy source by default | Rejected |
| Explicit compatibility mode | Allowed only when intentionally requested |
| Compatibility-derived contract | Marked noncanonical |
| Unvalidated parent | Never silently promoted |
| Canonical matching parent available | Takes precedence over compatibility source |

Task 09 should keep compatibility readable but de-center it. The primary path must become contract-driven and parent-validated.

## 7. Persistence and Fingerprints

Task 09 should extend short persistence so the short sidecar/artifact/manifest records the real parent and contract basis.

### Persistence delta

Add fields for:

- parent full identity
- parent full fingerprint/hash
- parent locale
- extraction version
- extraction hash
- short contract version
- short contract hash/build fingerprint
- prompt/compiler/schema fingerprints as placeholders for Task 10 consumption
- canonical/noncanonical compatibility marker

### Resume and invalidation expectations

Resume should reject a short artifact when any of these drift:

- parent full fingerprint/hash
- locale mismatch
- extraction version/hash
- contract version/hash
- prompt fingerprint
- schema version/fingerprint

### Fingerprint composition

Task 09 should define stable inputs for Task 10’s later prompt fingerprint:

- parent full fingerprint/hash
- extraction hash
- short contract hash
- locale
- output constraints

This prevents Task 10 from inventing another parallel lineage basis.

## 8. File-by-File Changes

| File | Task 09 change |
| --- | --- |
| `short-rewrite.service.ts` | Resolve validated matching-locale parent and persist extraction/contract lineage |
| `short-rewrite.resolution.ts` | Differentiate canonical vs compatibility parent resolution |
| `short-rewrite.schemas.ts` | Add parent/extraction/contract fields to sidecar/artifact/manifest |
| `short-rewrite.types.ts` | Add typed extraction and contract structures |
| `story-prompt-compiler.ts` | Accept compact short inputs instead of raw full text as the stable interface for Task 10 |
| `story-generation-preflight.ts` | Support localized-short parent descriptor semantics |
| `story-artifact-model.ts` | Add any shared issue codes or lineage typing needed by short contract consumers |
| `index.ts` | Export new extractor/contract types and helpers |

### Overlap with Task 10

| File | First task | Later task | Stable interface needed |
| --- | --- | --- | --- |
| `short-rewrite.types.ts` | 09 | 10 | extracted payload and short contract types |
| `short-rewrite.schemas.ts` | 09 | 10 | persisted contract/extraction fields |
| `story-prompt-compiler.ts` | 09 | 10 | compiler input boundary becomes contract-driven |
| `short-rewrite.service.ts` | 09 | 10 | parent resolution and persistence hooks |

Duplicate abstractions should be avoided by making Task 09 define the only supported short contract shape.

## 9. Focused Tests and Verification Commands

### Tests to add or update

- `short-rewrite.service.unit.test.ts`
  - validated matching-locale parent required
  - wrong-locale parent rejected
  - parent hash persists
  - compatibility mode explicit and noncanonical
- `short-rewrite.unit.test.ts`
  - extraction deterministic
  - extraction materially smaller than full story
  - required beats remain
  - orphaned references detected
- `story-prompt-compiler.unit.test.ts`
  - short compiler input no longer depends on full-story text boundary
- `story-generation-preflight.unit.test.ts`
  - localized short parent descriptors require matching locale

### Verification commands

Use focused Vitest file execution only:

- `pnpm test -- packages/story-localization/src/short-rewrite.unit.test.ts`
- `pnpm test -- packages/story-localization/src/short-rewrite.service.unit.test.ts`
- `pnpm test -- packages/story-localization/src/story-prompt-compiler.unit.test.ts`
- affected package typecheck only after focused tests pass

## 10. Implementation Order

1. Define typed extraction and short contract structures.
2. Implement canonical parent resolution rules for English and localized shorts.
3. Build deterministic extraction/hash generation.
4. Persist extraction/contract metadata in sidecars, artifacts, and manifests.
5. Update preflight parent semantics for localized short.
6. Update compiler interface boundary for Task 10 consumption.
7. Add focused tests.

## 11. Compatibility Risks

| Risk | Mitigation |
| --- | --- |
| Existing short artifacts/manifests lack parent/contract metadata | Preserve read compatibility but write canonical new records with stronger fields |
| Compatibility mode users may depend on raw-source flow | Keep explicit opt-in mode, clearly marked noncanonical |
| English locale inconsistency (`en` vs `en-US`) may surface in short lineage typing | Keep the inconsistency visible as an implementation decision to settle with Task 10 and tests |

## 12. Remaining Uncertainties

Only these uncertainties remain:

1. Whether localized-short batch preparation exists in a way that should consume the Task 09 contract immediately, or whether Task 10 can defer localized-short batch support.
2. Whether short locale normalization should adopt `en-US` for English to align with `language-profiles.ts`, or intentionally preserve `en` in short-only compatibility structures until a broader cleanup task.

These do not block Task 09 planning. The recommended implementation model is to add one deterministic extractor and one canonical short contract layer, then have Task 10 consume that layer without re-reading the full story.
