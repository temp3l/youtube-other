# Cursor Prompt — Final Hardening of Veronica Semantic Image Prompts

## Role

Act as a senior multimodal prompt engineer.

Apply a **small, bounded hardening pass** to the existing `veronicaBenini` semantic image-prompt pipeline.

The current semantic preflight and bounded prompt projection are already working.

Do not redesign them.

Do not generate images in this task.

---

# Context

The current `L01-S01-V03` final prompt is semantically strong and approved for image calibration.

It correctly communicates:

- being an expert and being perceived as an expert are different;
- real competence and recognizable competence are separate states;
- a buyer compares two credible professionals;
- one professional's evidence is difficult to interpret;
- the other's proof is coherent and immediately recognizable.

Two small prompt-quality issues remain:

1. unsupported/unnecessary identity specificity:
   - `including a nonbinary creative director`

2. repeated negative/text-free constraints:
   - multiple equivalent "no readable text" clauses;
   - repeated generic editorial / luxury avoidance language.

Fix these without weakening semantic precision.

---

# Critical invariant — preserve bounded prompt projection

A previous live semantic-preflight run exposed deterministic final-prompt length failures above the existing 450-word provider guard.

The bounded final-prompt projection is now required behavior.

Do NOT:

- remove it;
- weaken it;
- bypass it;
- replace it with naive string truncation.

The semantic brief may remain detailed.

The **provider-facing final image prompt** must remain structurally compacted.

Target:

```text
normal final prompt: 250–350 words
absolute maximum: <= 450 words
```

Shorts should usually remain closer to:

```text
180–300 words
```

Compaction must preserve meaning by priority, not by blind truncation.

---

# Prompt-information priority

Preserve content in this order:

1. viewerTakeaway
2. mustShow
3. actionIntent
4. generationBasePrompt semantics
5. essential subjects
6. essential environment
7. essential objects/evidence
8. composition
9. camera/lens
10. lighting
11. genre/factual constraints
12. negative constraints

Remove or collapse lower-value repetition first.

---

# Change A — remove unsupported identity specificity

The current V03 prompt contains:

```text
including a nonbinary creative director
```

This is not required by the narration's semantic meaning.

Replace it with a neutral, reusable formulation:

```text
prospective buyer; two equally credible professionals
```

or equivalent.

Generalize this into a Veronica prompt rule:

> Do not introduce demographic, occupational, identity, age, nationality,
> gender-identity, or lifestyle specificity unless it is required by the
> canonical narration, approved character continuity, or approved visual plan.

Examples of unnecessary specificity to avoid:

```text
nonbinary creative director
Italian architect
female startup founder
male marketing consultant
young fashion entrepreneur
```

unless the canonical source/treatment explicitly requires it.

Do not remove legitimate continuity attributes already approved by the visual plan.

---

# Change B — consolidate duplicate negative constraints

The current final prompt repeats several equivalent rules such as:

```text
no readable text, letters, numbers, logos, UI, or watermarks

No captions, subtitles, labels, letters, numbers, logos, watermarks,
fake UI copy, or readable generated text
```

Replace duplicate clauses with one canonical compact form:

```text
No readable text of any kind: no captions, subtitles, labels, letters,
numbers, logos, watermarks, or fake UI copy.
```

Do the same for duplicate generic-drift constraints.

For example, instead of repeating:

```text
generic editorial mood
Avoid generic luxury or editorial imagery...
unexplained luxury objects
prestige settings
```

assemble one compact negative block such as:

```text
Avoid generic editorial/luxury mood, prestige settings, decorative
display props, symbolic installations, and contemplative portraits
unless directly required by the narration beat.
```

Preserve semantic intent.

Reduce repetition.

---

# Change C — canonical negative-constraint assembler

If not already present, add a small deterministic helper for Veronica final prompts that:

1. receives negative constraints from:
   - semantic brief;
   - genre adapter;
   - visual treatment;
   - text-free policy;

2. normalizes equivalent constraints;

3. deduplicates them deterministically;

4. renders one concise negative-constraint block.

Do NOT implement fuzzy AI-based deduplication.

Use deterministic semantic categories / normalized strings / explicit aliases.

Examples of equivalent categories:

```text
READABLE_TEXT
GENERIC_EDITORIAL_DRIFT
LUXURY_PRESTIGE_DRIFT
DECORATIVE_SYMBOLISM
THOUGHTFUL_PORTRAIT_DRIFT
```

Adapt to current code conventions.

---

# Change D — subject-specificity gate

Add a narrowly scoped Veronica validation rule.

A subject descriptor should be retained only if one of these is true:

```text
canonical narration requires it
OR
approved visual plan requires it
OR
continuity/character identity requires it
OR
the descriptor materially communicates the narration beat
```

Otherwise remove it from the final provider prompt.

Do not mutate the semantic source itself if metadata retention is useful.

This is a **final-prompt projection rule**.

---

# Change E — preserve approved V03 scene

Do NOT alter the approved semantic scene structure for `L01-S01-V03`.

It should still mean:

```text
Two credible professionals are shown in one clear business comparison.

One has strong underlying competence and real work quality, but the
evidence is difficult for the buyer to interpret.

The other has equally credible competence presented through coherent,
easy-to-recognize proof.

The buyer immediately understands one option while struggling to
interpret the other.
```

Keep:

- neutral professional consultation setting;
- buyer + two credible professionals;
- direct comparison;
- difficult-to-read evidence vs coherent proof;
- medium-wide three-person comparison;
- lateral profile viewpoint;
- approved camera/lens;
- approved lighting;
- native 9:16;
- text-free image;
- immediate-read staging.

Do not restore:

- reflection installation;
- artifact archive;
- mirror plane;
- memory tokens;
- silhouette cards.

---

# Change F — final V03 target shape

The final provider-facing prompt should resemble this structure:

```text
TEXT-FREE CANONICAL IMAGE — native 9:16 composition.

Spoken meaning: Being an expert and being perceived as an expert are different.

Viewer takeaway: Real competence and recognizable competence are separate states.

Must show: strong hidden competence on one side; equally credible
competence made immediately recognizable on the other.

Visible action: the buyer immediately understands the coherent proof
presented by one professional while struggling to interpret the other
professional's equally credible but difficult-to-read evidence.

Primary scene: two credible professionals in one direct business comparison.

Environment: neutral professional consultation setting where a buyer
can compare both professionals and their real work evidence.

Essential subjects: prospective buyer; two equally credible professionals.

Objects and evidence: unlabeled real work samples; difficult-to-interpret
evidence on one side; coherent proof portfolio on the other.

Composition: medium-wide three-person comparison, professionals side by
side, buyer foreground, visually clear evidence contrast.

Camera/lens: preserve approved treatment.
Lighting: preserve approved treatment.

Immediate-read staging: concrete human behavior and visible cause/effect;
understandable in under one second on a phone screen.

Negative constraints: avoid generic editorial/luxury mood, prestige
settings, decorative symbolism, and contemplative portraits unless
required by the beat. No readable text of any kind: no captions,
subtitles, labels, letters, numbers, logos, watermarks, or fake UI copy.
```

Do not hardcode this exact prose if current deterministic assembly produces an equivalent, cleaner result.

---

# Apply safely beyond V03

Apply the generic improvements to other Veronica final prompts where applicable:

- unsupported subject specificity removal;
- deterministic negative deduplication;
- text-free constraint consolidation;
- bounded prompt projection.

Do NOT rewrite valid scene semantics just to reduce word count.

Do NOT alter History behavior.

---

# Cache/versioning

If final provider-facing prompt output changes deterministically, update the appropriate Veronica prompt/assembler version so stale generated-image identity is invalidated correctly.

Do not bump:

- History adapter version;
- History prompt version;
- shared semantic schema version;

unless technically required.

Prefer the narrowest Veronica-specific version change.

---

# Required tests

## 1. V03 identity cleanup

Assert final V03 prompt does NOT contain:

```text
nonbinary creative director
```

unless a fixture explicitly marks that identity as required.

Assert it contains:

```text
two equally credible professionals
```

or equivalent.

---

## 2. Unsupported subject specificity

Fixture:

```text
semantic output:
"young Italian female marketing consultant"

canonical/visual plan:
no demographic requirement
```

Expected final prompt:

```text
credible marketing professional
```

or the nearest repository-consistent neutral projection.

Do not over-generalize if occupation itself is semantically relevant.

---

## 3. Approved continuity specificity

Fixture where an approved character identity genuinely requires a specific trait.

Expected:

```text
trait is preserved
```

The new rule must not erase approved continuity.

---

## 4. Negative deduplication

Input equivalent constraints from multiple sources.

Expected:

- one compact text-free rule;
- one compact generic-drift rule;
- no repeated equivalent clauses.

---

## 5. Prompt length

Use an intentionally verbose live-style semantic brief.

Assert:

```text
final prompt <= 450 words
```

Target behavior should naturally produce approximately:

```text
250–350 words
```

where semantics permit.

Do not assert an exact lower/upper target if that makes valid concise prompts fail.

---

## 6. Semantic preservation

All five `L01-S01` final prompts must still represent:

1. better expert loses client;
2. expertise is invisible;
3. buyers judge visible signals;
4. real expertise vs perceived expertise;
5. positioning makes real competence visible.

---

## 7. V03 anti-abstraction regression

Assert V03 still excludes:

- reflection installation;
- artifact archive;
- mirror plane;
- memory tokens;
- silhouette cards.

---

## 8. History no-regression

Run affected shared/History tests.

Confirm:

- History final prompt output behavior unchanged;
- History adapter unchanged;
- trusted-script/no-research unchanged;
- maps/diagrams unchanged;
- reference-image gating unchanged.

---

# Validation

Run focused affected-scope validation only:

1. Veronica final prompt assembler tests;
2. Veronica semantic adapter tests;
3. L01-S01 regression;
4. bounded-prompt projection tests;
5. negative-deduplication tests;
6. subject-specificity tests;
7. affected History no-regression tests;
8. affected typecheck;
9. affected ESLint.

Do not run full repository validation.

Do not call paid providers.

Do not generate images.

---

# Acceptance criteria

Complete only when:

- [ ] V03 remains semantically approved;
- [ ] unsupported `nonbinary creative director` specificity is removed;
- [ ] approved continuity traits remain supported;
- [ ] duplicate text-free constraints are consolidated;
- [ ] duplicate generic-drift negatives are consolidated;
- [ ] final prompt projection remains deterministic;
- [ ] final prompts remain <= 450 words;
- [ ] bounded projection uses semantic priority, not blind truncation;
- [ ] all five L01-S01 meanings remain correct;
- [ ] V03 abstract legacy treatment remains blocked;
- [ ] multilingual reuse remains unchanged;
- [ ] History behavior remains unchanged;
- [ ] affected tests/typecheck/lint pass;
- [ ] no images are generated.

---

# Final response

Return only:

1. `VERDICT: APPROVE_FOR_L01_IMAGE_CALIBRATION` or `BLOCKED`
2. files changed;
3. subject-specificity rule implemented;
4. V03 subject before → after;
5. negative-constraint deduplication before → after;
6. final V03 word count;
7. final V03 prompt preview;
8. all five L01-S01 semantic regression status;
9. bounded-prompt regression status;
10. History no-regression status;
11. tests/typecheck/lint status;
12. Veronica prompt/assembler version before → after;
13. exact next command to generate only the five L01-S01 calibration images;
14. blockers, if any.

Do not generate images.

Stop after final prompt-preview validation.
