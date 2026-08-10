# Cursor Prompt — Tighten Veronica Semantic Image Prompts for L01-S01

## Role

Act as a senior visual-prompt engineer working on the existing shared Semantic Image-Prompt Preflight.

Apply a small, Veronica-only remediation based on the reviewed `L01-S01` semantic brief.

Do not redesign the shared subsystem.
Do not touch History behavior.
Do not generate images in this task.

## Source finding

The current `L01-S01` semantic brief is conceptually correct, but two assets still contain generation-risky treatment details.

### V01
The semantic meaning is correct:
- expertise itself is hidden;
- the buyer can only inspect external evidence.

But `environmentIntent` is too broad:
- workshop
- shop floor
- studio wall
- hospitality space
- backstage production zone

This can cause visual drift into unrelated but attractive environments.

### V03
The semantic meaning is also correct:
- being an expert and being perceived as an expert are different.

But inherited treatment fields are too abstract:
- reflection installation
- artifact archive zone
- mirror plane
- silhouette cards
- memory tokens

These can produce visually interesting but semantically unclear images.

## Objective

Make the final image-generation prompts for `L01-S01` more direct and narration-aligned.

Specifically:
1. narrow V01 environment semantics;
2. simplify V03 into a clear business/human comparison;
3. ensure semantic meaning outranks decorative legacy treatment fields during final prompt assembly;
4. preserve approved camera/composition/diversity constraints where compatible;
5. keep History and shared behavior unchanged.

## Hard scope

Only modify what is necessary in:
- Veronica semantic adapter;
- Veronica fixture/test data;
- final prompt merge/precedence behavior if required;
- affected tests/docs.

Do not:
- change the shared schema;
- change History adapter behavior;
- change cache-key structure unless required by prompt-version bump;
- rewrite narration;
- change asset counts;
- change multilingual reuse;
- generate images;
- run full repository-wide validation.

## Remediation A — V01 environment narrowing

For `L01-S01-V01`, preserve:
- viewerTakeaway: skill itself is hidden from the buyer;
- visualRelationship: hidden-vs-visible;
- mustShow:
  - deep competence exists;
  - buyer is limited to external evidence.

Replace broad environment alternatives with one semantically stable intent similar to:

`professional consultation/work environment where the expert's real work quality is visible to the viewer but cannot be directly measured by the prospective client`

Do not include unrelated fallback environments such as:
- hospitality space;
- restaurant;
- boutique;
- gallery;
- generic workshop;
- generic shop floor;

unless the story beat explicitly requires them.

The visual should remain broadly reusable across business/expert contexts.

## Remediation B — V03 direct comparison

For `L01-S01-V03`, preserve:
- viewerTakeaway: real competence and recognizable competence are separate states;
- visualRelationship: comparison;
- mustShow:
  - strong hidden competence on one side;
  - equally credible competence made easy to recognize on the other.

Replace abstract scene semantics such as:
- reflection installation;
- artifact archive zone;
- mirror plane;
- silhouette cards;
- memory tokens;

with a direct business comparison.

Target semantic concept:

`Two credible professionals are shown in one clear comparison. One has strong underlying competence and real work quality, but the evidence is difficult for the buyer to interpret. The other has equally credible competence presented through coherent, easy-to-recognize proof. The buyer immediately understands one option while struggling to read the other.`

The image should communicate the contrast in under one second.

Avoid symbolic installations that require interpretation.

## Remediation C — prompt merge precedence

Inspect the final image-prompt assembler.

The final prompt must prioritize fields in this order:
1. `spokenMeaning`
2. `viewerTakeaway`
3. `mustShow`
4. `actionIntent`
5. `generationBasePrompt`
6. `environmentIntent`
7. `subjectRoles`
8. `objectIntent`
9. approved composition
10. approved camera/lens
11. approved lighting
12. genre/style polish
13. negative constraints

Decorative or legacy treatment details must not override semantic intent.

If a legacy field conflicts with or weakens the semantic brief:

`semantic brief wins`

Do not delete useful visual-plan metadata globally.
Implement precedence at merge/assembly time.

## Remediation D — abstract-treatment guard

Add a narrow Veronica-only semantic quality rule:

If an asset's final prompt depends on abstract props/environments that are not required by the narration, flag/refine it.

Examples:
- mirror installation
- memory tokens
- artifact archive
- symbolic gallery
- material board
- luxury object display

These are not inherently forbidden.

They are only allowed when:
- the narration beat genuinely requires that metaphor; and
- the final prompt remains immediately understandable.

For L01-S01-V03 they should be rejected.

## Remediation E — preserve visual diversity

Do not collapse the existing viewer-visible hook/scene diversity.

Keep:
- existing camera family where compatible;
- existing aspect ratio;
- native 9:16 planning;
- unique hook grammar;
- continuity rules;
- text-free image requirement.

Changing V03 from an abstract installation to a business comparison must not make it identical to V01 or the hook.

Use a materially different:
- composition;
- camera distance;
- subject arrangement;

while keeping the semantic comparison direct.

## Required regression tests

### 1. V01 environment
Assert final semantic/final prompt does not contain broad unrelated alternatives such as:
- hospitality space;
- restaurant;
- boutique;
- gallery.

Assert it contains a professional/business evaluation context.

### 2. V03 abstraction removal
Assert final semantic/final prompt does not contain:
- reflection installation;
- artifact archive;
- mirror plane;
- memory tokens;
- silhouette cards.

Assert it clearly contains:
- two credible professionals;
- hidden/difficult-to-read competence;
- recognizable/coherent proof;
- buyer interpretation/selection contrast.

### 3. Merge precedence
Create a fixture where:
- semantic brief = direct business comparison
- legacy treatment = abstract reflective installation

Expected:
- final prompt follows direct business comparison

The legacy treatment must not dominate.

### 4. Prompt semantic retention
For all five `L01-S01` assets, final assembled prompts must still map to:
1. better expert loses client;
2. expertise is invisible;
3. buyer judges visible signals;
4. real vs perceived expertise;
5. positioning makes competence visible.

### 5. History no-regression
Run affected History semantic prompt tests and confirm:
- History adapter output unchanged;
- map/diagram preservation unchanged;
- reference-image gating unchanged;
- trusted-script/no-research unchanged.

Do not modify History fixtures unless required by shared test plumbing.

## Prompt-versioning

Because generation semantics change, bump only the relevant Veronica semantic prompt/adapter version if current cache invalidation requires it.

Prefer something like:

`veronica-semantic-image-prompt-v2`

or an adapter version bump.

Do not invalidate History semantic prompt caches.

## Inspection output

After implementation, regenerate/inspect `L01-S01` semantic prompt previews.

Return the final assembled prompt preview for:
- `l01-s01-v01-base`
- `l01-s01-v03-base`

Also show that the other three asset meanings remain unchanged.

## Validation

Run focused validation only:
1. Veronica semantic adapter tests;
2. L01-S01 fixture tests;
3. prompt assembler precedence test;
4. generic-drift/abstract-treatment test;
5. History affected no-regression tests;
6. affected typecheck;
7. affected ESLint.

Do not run paid providers.
Do not generate images.

## Acceptance criteria

Complete only when:
- [ ] V01 no longer offers unrelated environment choices;
- [ ] V03 no longer uses reflection/archive/memory-token abstraction;
- [ ] V03 is a direct business comparison;
- [ ] semantic brief outranks decorative legacy treatment fields;
- [ ] all five L01-S01 meanings remain correct;
- [ ] final prompts include action, subject, environment, composition, camera, lighting;
- [ ] text-free invariant remains intact;
- [ ] hook/scene diversity does not regress;
- [ ] multilingual reuse remains unchanged;
- [ ] History behavior remains unchanged;
- [ ] tests/typecheck/lint pass;
- [ ] no images are generated.

## Final response

Return only:
1. `VERDICT: APPROVE_FOR_L01_IMAGE_CALIBRATION` or `BLOCKED`
2. files changed;
3. V01 environment before→after;
4. V03 treatment before→after;
5. prompt merge precedence status;
6. five L01-S01 semantic meanings status;
7. History no-regression status;
8. tests/typecheck/lint status;
9. Veronica prompt/adapter version before→after;
10. final assembled prompt preview for V01;
11. final assembled prompt preview for V03;
12. exact next command to generate only the five L01-S01 calibration images;
13. blockers, if any.

Do not generate images.

Stop after prompt-preview validation.
