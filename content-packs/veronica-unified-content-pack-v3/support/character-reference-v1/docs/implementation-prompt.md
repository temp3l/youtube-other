# Codex implementation prompt — Veronica character-reference pipeline v1

## Goal

Implement a production-grade, reusable character identity/reference subsystem and activate it for the Veronica Benini image-generation pipeline for BOTH short (9:16) and full/long (16:9) video production.

Use the supplied character-reference pack as the initial Veronica identity asset set.

The implementation must preserve the current semantic-image architecture and must NOT reduce image diversity by forcing the source photograph's wardrobe, pose, lighting, or background into generated scenes.

At the end, run a bounded Veronica calibration and generate a NEW review pack for human review.

---

## Inputs

Character pack root supplied with this prompt:

- `source/veronica-original.webp`
- `references/front-neutral.png`
- `references/front-smiling.png`
- `references/three-quarter-left.png`
- `references/three-quarter-right.png`
- `references/profile-left.png`
- `references/profile-right.png`
- `references/gesture-open-hands.png`
- `references/gesture-explaining.png`
- `manifest.json`

Treat:

`source/veronica-original.webp`

as the canonical identity source.

All generated/cropped references are secondary identity-assistance references only.

---

## Non-negotiable behavioral requirements

### Identity is separate from scene direction

Character identity must NOT implicitly lock:

- wardrobe
- red dress
- bracelet/accessories
- pose
- white/off-white background
- source-image lighting
- source-image camera angle
- source-image composition

The reference establishes who Veronica is.

The scene plan establishes what Veronica is doing, wearing, where she is, how she is framed, and how the scene is lit.

### Same identity for short and full variants

Do NOT create separate identities such as:

- `veronica-short`
- `veronica-long`
- `veronica-vertical`
- `veronica-landscape`

Use one stable identity:

`veronica-benini`

with an explicit identity version, initially:

`v1`

Short/full variants may alter framing/composition only.

### Minimal reference selection

Do NOT send the entire reference set on each provider request.

Default maximum:

- canonical source
- plus at most one derived reference

unless a provider-specific implementation has a documented reason to require otherwise.

Never attach Veronica references to scenes where Veronica is not visible.

### Structured subject identity

Do NOT rely on regex/name matching in generated prompt prose.

The semantic scene/domain model must be capable of explicitly representing a stable character/subject identifier.

Preferred conceptual shape:

```ts
interface SceneSubject {
  readonly subjectId: string;
  readonly kind:
    | 'character'
    | 'historical-figure'
    | 'generic-person'
    | 'object';
  readonly visibility:
    | 'primary'
    | 'secondary'
    | 'background';
  readonly identityRequired?: boolean;
  readonly framingPreference?:
    | 'close-up'
    | 'medium'
    | 'wide'
    | 'full-body';
  readonly posePreference?: string;
  readonly expressionPreference?: string;
}
```

Adapt this to existing repository types rather than duplicating an equivalent abstraction.

---

## Phase 0 — inspect before editing

Inspect the repository and identify the actual current paths/types for:

1. Veronica semantic scene planning.
2. Veronica semantic image prompts.
3. Shared image-generation request/provider abstraction.
4. Image fingerprints/cache keys.
5. Existing generated-image reuse.
6. Short/full variant handling.
7. Veronica visual QA/review-pack generation.
8. Existing reference-image support, if any.
9. Existing History historical-figure/reference-image support, if any.

Reuse existing abstractions where appropriate.

Do not introduce a parallel subsystem if one already exists.

Document the integration seam before editing.

---

## Phase 1 — install/copy the character pack

Place the supplied assets in a stable repository-owned location consistent with current conventions.

Preferred conceptual location:

```text
assets/
  characters/
    veronica-benini/
      v1/
        manifest.json
        source/
          veronica-original.webp
        references/
          ...
```

If the repository already has a better canonical asset root, use it.

Do not modify the images.

Do not regenerate them in this task.

Ensure repository-relative paths are deterministic and portable.

---

## Phase 2 — character identity domain model

Implement or extend a generic shared character-reference abstraction.

Prefer a generic package/module rather than Veronica-only provider logic.

Conceptually provide:

```ts
interface CharacterIdentityManifest {
  readonly schemaVersion: 1;
  readonly characterId: string;
  readonly identityVersion: string;
  readonly canonicalSource: CharacterCanonicalSource;
  readonly references: readonly CharacterReference[];
}

interface CharacterCanonicalSource {
  readonly path: string;
  readonly sha256: string;
}

interface CharacterReference {
  readonly id: string;
  readonly path: string;
  readonly view:
    | 'front'
    | 'three-quarter-left'
    | 'three-quarter-right'
    | 'profile-left'
    | 'profile-right';
  readonly framing:
    | 'headshot'
    | 'waist-up'
    | 'full-body';
  readonly expression:
    | 'neutral'
    | 'smiling'
    | 'speaking'
    | 'gesturing';
  readonly source:
    | 'canonical'
    | 'derived';
  readonly sha256: string;
}
```

Use strict runtime validation consistent with repository conventions.

Reject:

- missing files
- invalid manifest versions
- invalid reference IDs
- duplicate reference IDs
- mismatching/checksum corruption if repository policy validates hashes
- path traversal
- unsupported reference metadata

Do not introduce `any`.

Do not weaken existing strict TypeScript settings.

---

## Phase 3 — CharacterReferenceRegistry

Implement a generic registry/resolver.

Required behavior:

```ts
resolveCharacter('veronica-benini')
```

returns the validated identity manifest.

The registry must:

- resolve repository-relative assets safely
- cache validated manifests in-process where appropriate
- expose deterministic identity metadata
- avoid reading/parsing the manifest repeatedly per scene
- fail with typed/domain errors
- provide useful structured logging without leaking binary image contents

Do not hard-code provider logic into the registry.

---

## Phase 4 — semantic scene integration

Wire Veronica planning so scenes containing Veronica explicitly carry:

```text
subjectId = veronica-benini
kind = character
identityRequired = true
```

Only set this when the intended visible human subject is Veronica.

Do not mark:

- generic buyers
- clients
- colleagues
- background people
- metaphorical figures

as Veronica.

Ensure BOTH short and full/long Veronica planners/projectors preserve this subject identity through subsequent transformations.

Do not infer Veronica identity merely because the episode genre is Veronica.

A scene can belong to the Veronica genre while showing no Veronica character.

---

## Phase 5 — reference selection policy

Implement a deterministic `CharacterReferenceResolver`.

Inputs should include, as available:

- character ID
- framing
- pose
- expression
- camera/view intent
- provider capabilities

Output should include:

- character ID
- identity version
- selected reference descriptors
- deterministic selection reason

Default policy:

### Front-facing / medium / presenter

Select:

1. canonical source
2. `front-neutral` OR `front-smiling` depending on expression

### Three-quarter composition

Select:

1. canonical source
2. matching three-quarter reference

### Profile composition

Select:

1. canonical source
2. matching profile reference

### Gesturing/explaining

Select:

1. canonical source
2. the most relevant gesture reference

If no useful derived reference matches:

use canonical source only.

Do not select references randomly.

Do not exceed the configured maximum by default.

---

## Phase 6 — shared image-generation request

Extend the shared provider-neutral image-generation request only if required.

Prefer a generic shape conceptually equivalent to:

```ts
interface ImageReference {
  readonly id: string;
  readonly path: string;
  readonly purpose:
    | 'character-identity'
    | 'composition'
    | 'style'
    | 'object'
    | 'historical-reference';
  readonly priority?: number;
}

interface ImageGenerationRequest {
  // existing fields...
  readonly references?: readonly ImageReference[];
}
```

Do not overload raw prompt text with filesystem paths.

Keep provider-specific transformation in the provider adapter.

Preserve compatibility for callers with no references.

Do not regress History or other genres.

---

## Phase 7 — provider adaptation

Inspect the actual image provider implementation and use its currently supported reference/edit/input-image mechanism.

Do not invent unsupported API parameters.

If the provider accepts multiple reference/input images, map the selected identity references in deterministic priority order.

If a provider only supports one usable identity/reference image:

prefer the canonical source.

If reference-image support is not available for a configured provider:

- preserve current generation behavior
- emit a typed capability/status result or bounded warning
- do not silently claim identity references were applied

Do not make provider support a global hard requirement for unrelated genres.

---

## Phase 8 — compact identity prompt projection

When identity references are attached, add a small, stable identity instruction block.

Equivalent semantics:

```text
CHARACTER IDENTITY

The primary subject is Veronica Benini.

Preserve the identity of the supplied character reference:
- facial structure
- apparent age
- hairstyle and hair colour
- body proportions
- characteristic facial appearance

The reference establishes identity only.

Do not automatically inherit:
- clothing
- accessories
- pose
- background
- lighting
- camera framing

Follow scene-specific instructions for those attributes.
```

Keep this block concise and stable.

Do not repeat a long physical description in every prompt.

Avoid prompt bloat.

Do not overwrite scene-specific wardrobe or composition.

---

## Phase 9 — cache/fingerprint integration

Update generated-image fingerprints so identity-dependent images cannot be incorrectly reused across identity-pack versions.

Include, where relevant:

- character ID
- identity version
- canonical source hash
- selected reference hashes
- reference-selection-policy version

Conceptually:

```ts
characters: selectedCharacters.map(character => ({
  characterId: character.characterId,
  identityVersion: character.identityVersion,
  references: character.references.map(reference => reference.sha256),
}))
```

Requirements:

- deterministic ordering
- no absolute paths
- no timestamps
- no nondeterministic selection
- scenes without character identity should retain existing fingerprint behavior as closely as possible

Changing Veronica from `v1` to a future `v2` must invalidate identity-dependent generation reuse without globally invalidating unrelated images.

---

## Phase 10 — generated-asset metadata and reuse

When the repository records generated image metadata, persist enough identity metadata to make future reuse safe.

At minimum:

```text
characterId
identityVersion
selectedReferenceIds
selectedReferenceHashes
```

If semantic asset reuse exists, ensure an asset featuring Veronica cannot be treated as identity-compatible with another character.

Do not implement broad new cross-episode similarity infrastructure in this task if it does not already exist.

Only make the minimum safe integration into the existing reuse system.

---

## Phase 11 — identity QA

Integrate identity-specific QA at the appropriate post-generation/review stage.

Do NOT build an expensive new ML face-recognition service unless one already exists.

For v1, use the strongest practical mechanism available in the current architecture:

- provider-independent metadata validation
- image-review model when already used by the pipeline
- visual QA prompt extension
- existing semantic/visual review mechanism

Introduce structured QA issue codes equivalent to:

```text
FACE_IDENTITY_DRIFT
AGE_DRIFT
HAIR_DRIFT
BODY_PROPORTION_DRIFT
REFERENCE_WARDROBE_OVERFIT
REFERENCE_BACKGROUND_OVERFIT
CHARACTER_NOT_RECOGNIZABLE
MULTIPLE_CHARACTER_IDENTITY_COLLISION
```

Severity guidance:

Hard failure / regeneration candidate:

- clearly different person
- major facial-structure drift
- large apparent-age change
- strongly incorrect hair identity
- character is not recognizable as intended identity
- multiple generated people incorrectly inherit Veronica's identity

Warning only unless severe:

- minor hairstyle variation
- makeup variation
- small apparent-age shift
- harmless lighting effects
- scene-appropriate wardrobe differences

Do NOT reject images merely because Veronica is not wearing the red source dress.

In fact, flag systematic red-dress/background copying as reference overfit when the scene did not request it.

---

## Phase 12 — observability

Add structured diagnostics at existing logging seams.

Useful fields:

```text
sceneId
episodeId
variant
characterId
identityVersion
referenceSelectionPolicyVersion
selectedReferenceIds
provider
model
referenceCapability
cacheHit
```

Do not log:

- raw image binaries
- base64 image payloads
- secrets
- provider credentials

Keep logs bounded.

---

## Phase 13 — configuration

Add a bounded Veronica feature switch following existing config conventions.

Conceptually:

```text
VERONICA_CHARACTER_REFERENCE_ENABLED=true
```

Prefer repository configuration over introducing a new environment variable if an established feature-config mechanism exists.

Default behavior should be chosen conservatively according to current project conventions.

The activation must apply consistently to:

- short production
- full/long production

but only for scenes with explicit Veronica identity.

Do not activate this for History in this task.

The underlying abstraction should remain reusable by History later.

---

## Phase 14 — tests

Use risk-based, affected-scope validation only.

Do NOT run repository-wide test/build suites unless a focused failure indicates escalation is necessary.

Add focused tests for:

### Manifest

- valid manifest accepted
- duplicate IDs rejected
- invalid path rejected
- missing canonical source rejected
- deterministic hash/reference metadata

### Registry

- resolves Veronica
- caches validated manifest
- typed failure for missing identity

### Reference selection

- front scene
- three-quarter scene
- profile scene
- gesture scene
- canonical-only fallback
- deterministic ordering
- maximum reference count

### Semantic propagation

- short Veronica scene preserves `veronica-benini`
- full Veronica scene preserves `veronica-benini`
- non-Veronica human does not inherit identity
- scene without Veronica receives no character references

### Fingerprinting

- same inputs => same fingerprint
- changing selected reference => different fingerprint
- changing identity version => different fingerprint
- unrelated scenes remain unaffected

### Prompt projection

- identity instructions present when references are active
- no forced red-dress instruction
- no forced white-background instruction
- scene wardrobe remains authoritative

### Provider adaptation

- references mapped correctly when capability exists
- canonical reference prioritized
- unsupported-reference provider path degrades safely

### QA

- identity drift can be represented
- red-dress/background overfit is not mistaken for correct identity
- harmless wardrobe variation is not rejected

---

## Phase 15 — calibration episode

After implementation and focused validation, perform ONE bounded Veronica calibration.

Choose an existing representative Veronica short episode that:

- already has approved/usable narration
- contains several scenes with Veronica visible
- also contains scenes where Veronica is absent if available
- is already part of the current production workflow

Do not rewrite narration.

Do not change TTS pacing.

Do not perform unrelated semantic-prompt tuning.

Do not alter History.

Regenerate only image assets necessary for the calibration.

Use the current configured production image model/provider.

---

## Phase 16 — short AND long dry-run coverage

Even if only the short episode is regenerated, prove that both variants are wired.

Run a focused dry-run/inspection for:

```text
short / 9:16
full / 16:9
```

Verify:

- same `characterId`
- same `identityVersion`
- variant-appropriate framing
- references resolved only when Veronica is visible
- fingerprint includes identity information
- no short-only implementation seam

Do not perform a costly full long-form regeneration merely for this proof.

---

## Phase 17 — generate a NEW review pack

At the end, generate a fresh review pack using existing repository review-pack tooling.

The pack should make human review easy and include, where the existing format permits:

- generated calibration images
- scene IDs
- short/full variant metadata
- semantic image prompts
- selected character-reference IDs
- identity version
- provider/model
- fingerprint/cache status
- QA findings
- before/after comparison if an existing pre-reference image is available
- compact implementation report

Do not expose binary reference data inline in JSON/report files.

Name the pack clearly as a Veronica character-reference calibration review pack.

If the repository has an established timestamp naming convention, follow it.

---

## Acceptance criteria

Implementation is complete only when all of the following are true:

1. `veronica-benini:v1` exists as a validated character identity.
2. Canonical source remains authoritative.
3. Derived references are selectable but secondary.
4. Semantic scenes explicitly identify Veronica.
5. Both short and full variants preserve the same character identity.
6. Scenes without Veronica receive no Veronica reference.
7. Provider requests receive references through a typed provider-neutral abstraction.
8. Unsupported provider capability degrades explicitly and safely.
9. Reference selection is deterministic and bounded.
10. Prompt projection separates identity from scene/style/wardrobe.
11. Red dress, bracelet, white background, and source pose are not hard-coded identity traits.
12. Identity version/reference hashes affect relevant cache fingerprints.
13. Unrelated image cache behavior is not globally invalidated.
14. Generated asset metadata records identity provenance.
15. Identity QA is integrated into the existing review system.
16. Focused tests/typecheck/lint pass for affected code.
17. One short calibration episode has been regenerated.
18. Full/long wiring has been proven with a focused dry run.
19. A new review pack is generated.
20. No History regression is introduced.

---

## Out of scope

Do NOT:

- bulk regenerate all Veronica episodes
- activate this globally for History
- rewrite Veronica narration
- alter TTS speed/pacing/calibration
- change YouTube metadata
- redesign unrelated visual-direction logic
- introduce a vector database
- introduce face-recognition infrastructure
- add new external providers
- refactor unrelated image-generation code
- run full repository validation without an explicit escalation reason
- generate a second identity pack

---

## Implementation quality

Maintain:

- strict TypeScript
- immutable/read-only domain types where appropriate
- runtime validation at trust boundaries
- explicit error types
- deterministic behavior
- bounded logs
- unit-testable pure selection logic
- provider-neutral domain abstractions
- no `any`
- no hidden genre/name regex coupling

Prefer small composable modules over one large service.

Reuse existing repository naming/style conventions.

---

## Required final response

Return a concise implementation report containing exactly these sections:

### 1. VERDICT

One of:

```text
PASS
PASS_WITH_WARNINGS
BLOCKED
```

### 2. INTEGRATION SEAM

List the actual files/modules used for:

- semantic subject identity
- character registry
- reference resolver
- image request
- provider adapter
- fingerprint/cache
- QA
- review pack

### 3. FILES CHANGED

Exact paths.

### 4. CHARACTER IDENTITY

Report:

```text
characterId:
identityVersion:
canonicalSource:
derivedReferenceCount:
maxReferencesPerRequest:
```

### 5. SHORT/FULL COVERAGE

Report short and full separately.

### 6. CALIBRATION

Report:

- episode
- scenes regenerated
- provider/model
- identity refs selected per scene
- obvious identity drift
- wardrobe/background overfit
- regeneration failures

### 7. VALIDATION

Focused tests/typecheck/lint only.

### 8. CACHE/FINGERPRINT

Explain what now invalidates identity-dependent reuse.

### 9. REVIEW PACK

Provide the exact generated review-pack path.

### 10. BLOCKERS / WARNINGS

Only real remaining issues.

Do not propose unrelated follow-up work unless it blocks production activation.
