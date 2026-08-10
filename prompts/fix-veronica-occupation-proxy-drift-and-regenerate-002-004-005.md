# Cursor Prompt — Add Occupation-Proxy Drift Guard and Regenerate L01-S01 Scenes 002, 004, 005

## Role

Act as a senior multimodal prompt engineer and YouTube visual-direction engineer.

Apply a **small, Veronica-only enhancement** to the existing semantic image-prompt pipeline, then regenerate only the weak calibration scenes for `L01-S01`.

You must:

1. implement the remaining prompt-quality enhancements;
2. preserve the approved shared semantic-preflight architecture;
3. preserve History behavior unchanged;
4. regenerate only:
   - `scene-002`
   - `scene-004`
   - `scene-005`

Do not regenerate scenes 001 or 003 unless a strictly necessary dependency forces it.

---

## Why this task exists

The current regenerated `L01-S01` images are much better than the earlier failed batch, but they still drift into an **occupation-specific architecture / portfolio / material-sample consultancy vocabulary**.

This is a problem because the narration is about **generic expert positioning**, not about:

- architecture;
- interior design;
- construction;
- product design;
- craft workshop consultancy;
- hospitality design;
- material-sample selection.

The remaining issue is therefore:

```text
semantic meaning is mostly correct
        ↓
image model still makes the scene too profession-specific
        ↓
the image explains “architect/designer/client review”
more than “expert positioning / visible competence”
```

The fix must be systemic.

---

# Current calibration status

Treat the current batch as follows:

- `scene-001`: acceptable, keep as the positive anchor for decision-scene quality.
- `scene-003`: directionally acceptable, but architecture bias still present.
- `scene-002`: weak, regenerate.
- `scene-004`: weak, regenerate.
- `scene-005`: weak, regenerate.

Do not broaden scope beyond this.

---

# Primary objective

Add a Veronica-only **occupation-proxy drift guard** so the generator does not invent a specific profession merely to make an abstract positioning concept photographable.

Then regenerate `scene-002`, `scene-004`, and `scene-005` using the improved prompts.

The regenerated scenes must feel occupation-neutral and clearly explain the narration on a phone screen in under one second.

---

# Hard scope

Modify only what is needed in:

- Veronica semantic adapter / prompt rules;
- Veronica final prompt assembly / validation if needed;
- Veronica fixtures/tests;
- targeted generation flow for the three scenes;
- affected docs/reports.

Do not:

- redesign the shared semantic-preflight subsystem;
- change the shared schema unless unavoidable;
- change History behavior;
- change cache identity except for the narrow Veronica prompt/adapter version bump if needed;
- rewrite narration;
- regenerate scenes 001 or 003 without necessity;
- regenerate all five scenes;
- regenerate all 145 assets;
- run unrelated repository-wide validation.

---

# Enhancement A — occupation-proxy drift guard

Add a new Veronica-only rule:

## Rule name

`OCCUPATION_PROXY_DRIFT`

## Intent

Do not translate generic expertise/positioning concepts into a specific profession unless that profession is explicitly supported by the canonical narration, continuity, or approved visual plan.

Examples of unsupported proxy professions to avoid by default:

- architect
- interior designer
- construction consultant
- craftsperson
- product designer
- photographer
- fashion consultant
- hospitality designer
- gallery curator
- artisan/studio-maker

The goal is not to ban these forever.

The goal is:

> for generic expert-business narration, do not let the image generator invent a profession-specific visual world and make that the main explanatory mechanism.

## Enforcement principle

For generic positioning/business narration:

- prefer occupation-neutral professional contexts;
- prefer human decisions and information relationships;
- prefer general business evidence signals;
- prefer consultations, comparisons, evaluations, buyer decisions, clarity vs ambiguity;
- avoid specialized physical artifacts unless the beat explicitly requires them.

---

# Enhancement B — information-relationship priority

Add or strengthen a Veronica-only principle:

> The semantic concept must be readable primarily from **human action and information relationships**, not from the viewer interpreting specialized objects, portfolios, material boards, architectural plans, or profession-specific artifacts.

That means:

## Good explanatory devices
- client selection
- comparison
- confusion vs clarity
- proof vs hidden skill
- grouped vs scattered evidence
- visible signals
- recommendation/social-proof cues
- coherent offer/content/profile evidence
- one expert being easier to choose

## Weak explanatory devices
- specialized sample boards
- architecture renderings
- site plans
- design studio props
- workshop materials
- profession-specific tools used as the main metaphor

These are allowed only if explicitly justified by source meaning.

---

# Enhancement C — occupation-neutral business evidence set

For generic positioning/expert scenes, define a preferred evidence vocabulary such as:

- structured proposal or offer materials
- case-study / proof cards
- text-free portfolio structure
- recommendation / reputation cues
- content / expertise cues
- presentation materials
- comparison sheets
- proof clusters
- clean business evaluation artifacts
- coherent specialization evidence

Avoid making these look like:

- building renderings
- interior boards
- construction plans
- material swatches
- fashion lookbooks
- product-design mockups

No readable text inside the image.

---

# Enhancement D — preserve bounded prompt projection

A previous live run exposed prompt-length failures above the existing 450-word guard.

Preserve the bounded prompt projection.

Requirements:

- normal target: 250–350 words
- hard maximum: <= 450 words
- no naive truncation
- semantic priority must remain intact

Do not weaken or remove the current bounded-prompt fix.

---

# Enhancement E — keep earlier approved fixes

Preserve all previously approved behavior:

- `scene-001` decision clarity
- direct comparison treatment for V03 / `scene-004`
- removal of abstract reflection/archive/memory-token semantics
- no unsupported identity specificity
- deterministic negative-constraint deduplication
- text-free image policy
- native 9:16
- multilingual image reuse
- History no-regression

---

# Scene-specific regeneration targets

## Scene 002 — “expertise itself is invisible”

### Narration meaning
Customers cannot directly see expertise.

### Problem with current scene
It still reads too much like a workshop/material/archive setting.
The viewer sees profession-specific work artifacts instead of the core idea:
**the buyer cannot directly inspect competence**.

### Required target
The regenerated scene must clearly show:

- genuine expertise or high-quality work exists;
- the viewer can perceive that competence;
- the buyer cannot directly evaluate the actual skill itself;
- the buyer is forced to judge only visible external evidence/signals.

### Preferred structure
Use an occupation-neutral professional/business context.

Example target logic:

```text
The expert is visibly capable or engaged with substantive work/proof,
but that deeper competence is not directly available to the buyer.

The buyer only has access to a limited set of visible signals such as
structured evidence, proof summaries, or presentation artifacts.
```

### Avoid
- workshop drift
- craft bench
- design studio material table
- archive-like environment
- architecture/model vocabulary
- profession-specific object piles

### Strong image-reading test
The viewer should quickly understand:

> “The real skill is hidden; the buyer can only judge surface evidence.”

---

## Scene 004 — “expert vs perceived expert”

### Narration meaning
Being an expert and being perceived as an expert are different.

### Problem with current scene
The comparison improved, but both sides still read too similarly and the contrast is not obvious enough.

### Required target
The regenerated scene must make the contrast unmistakable:

- one professional has strong competence but difficult-to-read / scattered / ambiguous proof;
- the other has equally credible competence made easy to recognize through coherent evidence;
- the buyer clearly understands one and struggles with the other.

### Preferred structure
A direct human comparison is still correct.

But strengthen asymmetric readability:

```text
left side:
real work exists, evidence is fragmented or difficult to read

right side:
proof is coherent, legible, and immediately understandable

buyer:
visibly gravitates toward the clearer option
```

### Avoid
- both sides looking equally legible
- symbolic props
- abstract installations
- architecture/design portfolio drift
- profession-specific proxy artifacts

### Strong image-reading test
The viewer should immediately understand:

> “Both may be competent, but only one is easy to recognize as the right expert.”

---

## Scene 005 — “positioning makes expertise visible”

### Narration meaning
Positioning makes real competence visible and gives people a clear reason to choose you.

### Problem with current scene
It looks too much like a project/construction meeting rather than the payoff of positioning.

### Required target
This must feel like the resolution of the Short.

It should visually echo the logic of scene 001, but now with a positive payoff:

- one expert is clearly and confidently chosen;
- the reason is visible clarity of specialization/evidence;
- the buyer understands why they are choosing this person;
- the scene closes the story loop.

### Preferred structure
Occupation-neutral client-selection / professional-decision scene.

Example target logic:

```text
A buyer confidently chooses one clearly positioned expert because
their competence is now visible, coherent, and easy to understand.
```

### Avoid
- construction-site feel
- architecture project meeting
- field-work planning
- occupation-specific setting
- generic handshake cliché unless it clearly supports the beat

### Strong image-reading test
The viewer should immediately understand:

> “Now the expertise is clearly visible, so the expert is easy to choose.”

---

# Regeneration constraints

Regenerate only these three scenes:

- `scene-002`
- `scene-004`
- `scene-005`

Keep:

- aspect ratio
- project structure
- output location conventions
- provider settings unless the current repo logic requires a change
- the improved semantic prompt pipeline
- current prompt-length guard

If a scene can be edited/retried without invalidating scenes 001/003, do that.

Do not touch scenes 001 and 003 unless required by prompt versioning/caching mechanics. If they become marked stale due to narrow versioning, do not regenerate them in this task.

---

# Prompt-preview gate before regeneration

Before regenerating the three scenes, inspect the final provider-facing prompts and confirm they:

- do not contain architecture/interior-design/construction proxy drift;
- are occupation-neutral;
- preserve semantic clarity;
- remain <= 450 words;
- remain text-free;
- still use direct, mobile-readable storytelling.

If necessary, refine only the three targeted prompts before calling image generation.

---

# Required tests

## 1. Occupation-proxy drift detection
Add a Veronica-only regression where a generic expert-positioning beat incorrectly yields:
- architecture portfolio
- building renderings
- construction plans
- material boards
- design-studio artifacts

Expected:
- validator flags/refines as `OCCUPATION_PROXY_DRIFT`
- final prompt is corrected toward occupation-neutral business evidence

---

## 2. Scene 002 semantic target
Assert the final prompt expresses:
- hidden competence
- buyer cannot directly inspect the skill
- buyer judges only visible evidence

Assert it does NOT depend on:
- workshop
- design studio
- craft/material context
- architectural portfolio

---

## 3. Scene 004 semantic target
Assert the final prompt expresses:
- two equally credible professionals
- one difficult-to-read competence
- one coherent recognizable proof
- buyer clearly understands one option better

Assert it does NOT depend on profession-specific artifacts.

---

## 4. Scene 005 semantic target
Assert the final prompt expresses:
- visible competence
- clear reason to choose
- confident buyer selection
- positive resolution

Assert it does NOT read as:
- construction planning
- architecture site review
- field project meeting

---

## 5. Prompt length regression
Assert the three final prompts remain <= 450 words.

---

## 6. History no-regression
Run affected shared/History tests and confirm:
- History adapter unchanged
- trusted-script/no-research unchanged
- maps/diagrams unchanged
- reference-image gating unchanged

---

# Validation

Run focused affected-scope validation only:

1. Veronica prompt-rule / validator tests
2. targeted L01-S01 fixture tests
3. occupation-proxy-drift tests
4. prompt-preview assertions for scenes 002/004/005
5. bounded-prompt regression tests
6. affected History no-regression tests
7. affected typecheck
8. affected ESLint

Then regenerate only the three scenes.

Do not run broad full-corpus generation.

---

# Acceptance criteria

Complete only when:

- [ ] occupation-proxy drift guard is implemented for Veronica
- [ ] information-relationship priority is enforced
- [ ] scenes 002/004/005 prompts are occupation-neutral
- [ ] scenes 002/004/005 remain semantically correct
- [ ] scenes 002/004/005 prompts remain <= 450 words
- [ ] no architecture / construction / interior-design proxy drift remains in those three prompts
- [ ] scenes 001 and 003 are left unchanged in this task
- [ ] History behavior remains unchanged
- [ ] focused tests/typecheck/lint pass
- [ ] scenes 002/004/005 are regenerated successfully
- [ ] no other scenes are regenerated

---

# Final response

Return only:

1. `VERDICT: APPROVE_FOR_SECOND_L01_CALIBRATION_REVIEW` or `BLOCKED`
2. files changed
3. occupation-proxy drift rule status
4. prompt-preview summary for scenes 002, 004, 005
5. prompt word counts for scenes 002, 004, 005
6. regeneration status for scenes 002, 004, 005
7. scenes 001 and 003 untouched status
8. History no-regression status
9. tests/typecheck/lint status
10. output path of regenerated images
11. report path
12. blockers, if any

Do not regenerate any additional scenes.
Stop after the three-scene regeneration and targeted report/update.
