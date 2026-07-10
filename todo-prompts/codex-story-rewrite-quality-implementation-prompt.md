# Codex Implementation Prompt: Improve Story Rewrite and Localization Quality

Act as a senior TypeScript engineer, AI pipeline architect, prompt engineer, localization specialist, and professional YouTube horror-story editor.

Your task is to inspect and improve the existing story-rewrite pipeline so that it consistently produces concrete, cinematic, emotionally effective horror stories in English and preserves that quality across German, Spanish, French, Portuguese, and future localizations.

Work within the existing architecture. Reuse existing services, schemas, prompts, state files, validators, caches, logging, CLI commands, and provider abstractions wherever possible. Do not create a parallel pipeline unless the current architecture makes reuse impossible.

The affected reference episode is:

`episodes/030-the-woman-inside-the-painting/`

Use it as the primary regression fixture.

---

## Primary objective

Improve the pipeline so that:

1. English full stories are written as immersive narration rather than as outlines, production notes, editorial commentary, or explanations of storytelling technique.
2. English Shorts preserve the strongest visual beats, supernatural rule, climax, and final reveal from the canonical full story.
3. Localized full stories preserve the full canonical English narrative rather than collapsing into summaries.
4. Localized Shorts preserve all required beats from the canonical English Short.
5. Metadata, language instructions, duration estimates, and word counts are generated from the final localized narration rather than copied from English.
6. Low-quality, incomplete, abstract, truncated, or structurally invalid outputs are blocked before TTS, image generation, or rendering.
7. Existing batch, retry, cache, resume, simulation, and logging behavior continues to work.
8. Quality failures are observable and actionable.

---

## Reference files

### Full stories

- `episodes/030-the-woman-inside-the-painting/languages/script-en.md`
- `episodes/030-the-woman-inside-the-painting/languages/script-de.md`
- `episodes/030-the-woman-inside-the-painting/languages/script-es.md`
- `episodes/030-the-woman-inside-the-painting/languages/script-fr.md`
- `episodes/030-the-woman-inside-the-painting/languages/script-pt.md`

### Shorts

- `episodes/030-the-woman-inside-the-painting/languages/short/script-en.md`
- `episodes/030-the-woman-inside-the-painting/languages/short/script-de.md`
- `episodes/030-the-woman-inside-the-painting/languages/short/script-es.md`
- `episodes/030-the-woman-inside-the-painting/languages/short/script-fr.md`
- `episodes/030-the-woman-inside-the-painting/languages/short/script-pt.md`

Treat:

- `languages/script-en.md` as the intended canonical full-story source.
- `languages/short/script-en.md` as the intended canonical Short source.
- Full localizations as faithful adaptations of the canonical English full story.
- Short localizations as faithful adaptations of the canonical English Short.

Do not assume the current runtime source routing is correct. Verify it in code and fix it if necessary.

---

# Required implementation strategy

First inspect the existing implementation and produce a concise plan in the task log or implementation notes. Then implement the changes in safe, reviewable stages.

Do not stop after planning. Complete the implementation, tests, documentation, and validation unless blocked by missing repository context.

Do not make paid provider calls unless they are essential. Prefer unit tests, fixtures, simulation mode, stored debug responses, and deterministic prompt snapshots.

Preserve existing behavior unless a change is required by the acceptance criteria below.

---

# 1. Canonical story contract

Introduce or strengthen a typed canonical story contract that captures the narrative elements that must survive rewriting and localization.

Reuse an existing story bible, protected-elements model, source analysis, retention plan, structured story representation, or equivalent if one already exists.

Do not add duplicate concepts under new names if the repository already models them.

The canonical contract should represent at least:

```ts
type StoryInvariant = {
  id: string;
  type:
    | "character"
    | "object"
    | "event"
    | "rule"
    | "causal-link"
    | "location"
    | "climax"
    | "ending"
    | "emotional-cost";
  description: string;
  required: boolean;
  aliases?: string[];
  sourceEvidence?: string[];
};

type CanonicalStoryContract = {
  episodeId: string;
  format: "full" | "short";
  sourceLanguage: "en";
  sourcePath: string;
  title: string;
  protagonist: {
    name: string;
    role?: string;
    motivation?: string;
    emotionalCost?: string;
  };
  characters: Array<{
    name: string;
    role: string;
    required: boolean;
  }>;
  supernaturalRule: {
    trigger: string;
    effect: string;
    exceptions?: string[];
    forbiddenContradictions?: string[];
  };
  requiredEvents: StoryInvariant[];
  requiredObjects: StoryInvariant[];
  requiredCausalLinks: StoryInvariant[];
  climax: StoryInvariant[];
  ending: StoryInvariant[];
};
```

Adapt this shape to the existing domain model rather than forcing a new standalone schema.

The contract must be serializable, versioned, logged, and available to:

- English rewrite;
- English Short generation;
- localization;
- validation;
- repair;
- metadata generation where relevant.

---

# 2. Preserve concrete narrative beats

The pipeline must distinguish between concrete narration and abstract story commentary.

A strong narration paragraph should contain one or more of:

- observable character action;
- physical object;
- sensory detail;
- discovery;
- experiment;
- decision;
- consequence;
- contradiction;
- escalation;
- personal cost.

The pipeline must reject or repair narration that mainly explains:

- what the scene is meant to accomplish;
- why tension increases;
- why a detail matters;
- what the sound motif is intended to do;
- why the ending is disturbing;
- how the audience should interpret the scene;
- how the story structure functions.

Examples of narration that must be prevented:

- “The discovery changed the emotional stakes.”
- “At this point, the account accelerated.”
- “The purpose of the sound was to make the audience recognise danger.”
- “The story remains disturbing because the danger may not have ended.”
- “The final action worked because it contradicted what the threat expected.”
- “A second proof confirmed part of the incident.”
- “The central sign returned from an impossible location.”
- “The environment reorganized around one person.”

These may be valid planning notes but must not appear in final narration.

Add a reusable quality rule that detects likely planning-language leakage without relying only on an exact phrase blacklist.

Use a combination of:

- known-phrase detection;
- abstract-language heuristics;
- narrative-specific model validation if already available;
- required concrete-detail checks;
- prompt constraints.

Do not overfit validation to Episode 030.

---

# 3. Improve English full-story generation

Update the English full-story rewrite prompt and supporting pipeline so that it follows these principles.

## Opening

- Deliver the first impossible detail immediately.
- Do not spend the opening on biography, setting history, or generic atmosphere.
- Establish the ordinary context only after the audience has seen something impossible.
- The first 20 seconds should contain multiple distinct visual developments.

## Scene construction

Each scene should include at least three of:

- location;
- character action;
- physical object;
- sensory detail;
- evidence;
- decision;
- consequence;
- unresolved question.

Do not allow long stretches of procedural summary.

## Investigation

Replace generic investigation summaries with escalating experiments.

Each experiment should:

1. ask one clear question;
2. use a concrete object or action;
3. produce an observable result;
4. reveal or refine the supernatural rule;
5. make the situation worse.

## Emotional cost

The protagonist must have a personal and causal reason to continue.

Prefer emotional cost grounded in the protagonist’s decisions, such as:

- guilt;
- responsibility;
- broken trust;
- a promise;
- professional failure;
- choosing one person over safety;
- sacrificing evidence, reputation, escape, or identity.

Do not merely state that the stakes have changed. Dramatize the consequence.

## Supernatural rule

Create one precise rule and preserve it consistently.

The rule must define:

- trigger;
- effect;
- known exceptions;
- limits;
- what does and does not count;
- how the protagonist discovers it;
- how the climax uses it.

The climax must not silently change the rule.

## Escalation

Prefer this progression:

1. anomaly;
2. repeatable contradiction;
3. rule discovery;
4. personal intrusion;
5. failed reasonable response;
6. direct human consequence;
7. active plan;
8. costly climax;
9. concrete final reversal.

## Ending

End on a concrete image, action, sound, object, or contradiction.

Do not append generic explanation after the final reveal.

Avoid:

- “Perhaps it survived.”
- “Maybe it learned.”
- “The story remains disturbing because…”
- “Authorities never explained…”
- “The danger may return.”

The final image should communicate the implication.

---

# 4. Improve English Short generation

The English Short must be derived from the approved canonical English full story and its story contract.

Do not independently invent a new version unless explicitly configured.

Use this narrative shape:

- 0–3 seconds: impossible hook;
- 3–12 seconds: proof or contradiction;
- 12–22 seconds: supernatural rule;
- 22–35 seconds: personal consequence;
- 35–50 seconds: active climax;
- 50–60 seconds: concrete final reversal.

The Short must preserve:

- the central impossible event;
- the supernatural rule;
- the main character;
- the personal consequence;
- the active climax;
- the canonical final reveal.

The Short may omit:

- extended archival research;
- secondary witnesses;
- multiple failed plans;
- authorities;
- generalized aftermath;
- nonessential backstory.

The Short must not replace missing scenes with abstract summary language.

---

# 5. Faithful localization mode

Separate faithful localization from creative rewriting.

A localization task must not be treated as a fresh story rewrite.

The localization prompt must explicitly require preservation of:

- all named characters;
- all required events;
- all required objects;
- all causal links;
- numbers and counts;
- supernatural rule;
- climax mechanics;
- emotional cost;
- final reveal;
- chronology;
- point of view;
- tense;
- narrator style;
- horror intensity;
- content restrictions.

Allow adaptation only for:

- natural syntax;
- idioms;
- rhythm;
- sentence length;
- culturally natural phrasing;
- punctuation;
- language-specific narration flow.

Do not allow:

- summarization;
- replacement of specific events with generic descriptions;
- deletion of named characters;
- removal of visual objects;
- invention of a different ending;
- compression of a full story into an outline;
- replacement of scenes with statements such as “previous victims tried to escape.”

Use wording equivalent to:

> Localize faithfully into the target language. Preserve every required event, object, character, causal relationship, supernatural rule, climax action, and final reveal. Do not summarize, generalize, reconstruct, or independently rewrite the story. Produce natural narration in the target language while maintaining the source story’s structure and level of detail.

---

# 6. Separate full and Short profiles

Verify that full and Short generation cannot accidentally share:

- prompt templates;
- target lengths;
- output schemas;
- cache keys;
- repair prompts;
- validation thresholds;
- metadata settings;
- batch identities;
- output paths.

Introduce or strengthen a typed profile distinction.

For example:

```ts
type StoryFormat = "full" | "short";

type StoryGenerationProfile = {
  format: StoryFormat;
  sourcePath: string;
  targetWordRange: {
    min: number;
    max: number;
  };
  promptVersion: string;
  schemaVersion: string;
  validationProfile: string;
};
```

Use discriminated unions where appropriate.

Prevent invalid combinations at compile time where practical.

---

# 7. Length and completeness gates

Compute word counts from the final narration body, not from metadata or an earlier source.

Add configurable validation thresholds.

## Full localization

Default acceptable target/source word-count ratio:

- warning below `0.90`;
- block below `0.85`;
- warning above `1.10`;
- block above a configurable upper threshold where appropriate.

Allow explicit per-language adjustments only if justified and documented.

A full localization of a 1,234-word source must not pass at approximately 330–420 words.

## Short localization

Validate by both:

- source-to-target duration ratio;
- preservation of required beats.

Do not rely on word count alone because language density differs.

## Incomplete provider output

Reject provider responses when:

- response status is incomplete;
- finish reason indicates truncation;
- required structured fields are absent;
- narration ends abruptly;
- required ending invariants are missing;
- parsed output is materially shorter than the raw response;
- parsing falls back to a summary field.

Never silently accept partial output.

---

# 8. Story-invariant validation

Add a reusable validator that compares the final output with the canonical story contract.

Validate at least:

- required characters present;
- required objects present;
- required events present;
- required numbers preserved;
- causal order preserved;
- supernatural rule semantically preserved;
- emotional cost preserved;
- climax preserved;
- final reveal preserved;
- no contradictory rule introduced.

Use deterministic checks where possible.

Use model-based semantic validation only where deterministic validation is insufficient.

The validator should return structured findings such as:

```ts
type StoryQualityFinding = {
  code: string;
  severity: "error" | "warning";
  category:
    | "missing-character"
    | "missing-object"
    | "missing-event"
    | "missing-ending"
    | "rule-contradiction"
    | "causal-break"
    | "abstract-language"
    | "template-leakage"
    | "length-mismatch"
    | "language-mismatch"
    | "metadata-mismatch";
  message: string;
  evidence?: string[];
  repairable: boolean;
};
```

Reuse the existing quality-gate status model if one already exists.

Map failures to the existing statuses such as:

- `READY`
- `READY_WITH_MINOR_EDITS`
- `REVISION_REQUIRED`
- `REWRITE_REQUIRED`
- `BLOCKED`

Recommended blocking conditions:

- missing climax;
- missing final reveal;
- missing protagonist;
- severe source-length mismatch;
- wrong language;
- contradictory supernatural rule;
- incomplete response;
- full story routed through Short profile;
- final output is a summary rather than narration.

---

# 9. Repair-stage redesign

Inspect the current repair stage carefully.

Repairs must not regenerate an entire story from a compact validator summary unless explicitly required.

Prefer targeted repair.

Examples:

- restore one missing object;
- fix one incorrect language instruction;
- correct one rule contradiction;
- rewrite one abstract paragraph;
- restore the canonical ending;
- recalculate metadata.

When a full rewrite is unavoidable, the repair prompt must receive:

- complete canonical source narration;
- complete current target narration;
- canonical story contract;
- exact findings;
- strict target-length requirement;
- explicit prohibition against summarization.

After repair, rerun every relevant validation.

Add a regression check that repair may not reduce the narration below the configured minimum ratio.

Preserve the pre-repair artifact for forensic comparison.

Log:

- before word count;
- after word count;
- repaired findings;
- new findings;
- model;
- prompt version;
- source hash;
- target hash.

---

# 10. Metadata correctness

Generate metadata only after narration is final.

Recompute:

- narration word count;
- estimated duration;
- language code;
- localized primary title;
- localized SEO description;
- tags where localization is supported;
- hashtags;
- audio-language instructions.

Audio instructions must use the actual target language.

Examples:

- English: `Speak in natural English`
- German: `Speak in natural German`
- Spanish: `Speak in natural Spanish`
- French: `Speak in natural French`
- Portuguese: `Speak in natural Portuguese`

Prefer a typed language configuration rather than free-form prompt text.

For example:

```ts
type SupportedLanguage = "en" | "de" | "es" | "fr" | "pt";

type LanguageConfig = {
  code: SupportedLanguage;
  displayNameEnglish: string;
  displayNameNative: string;
  locale: string;
  narrationInstruction: string;
};
```

Do not copy English titles, SEO descriptions, word counts, runtime values, or narration instructions into localized files.

Add consistency validation between:

- output path;
- language code;
- detected language;
- title language;
- audio instruction;
- metadata.

---

# 11. Cache, batch, and state safety

Ensure cache and batch identities include all relevant dimensions:

- episode ID;
- source content hash;
- source language;
- target language;
- format;
- stage;
- model;
- reasoning level where relevant;
- prompt version;
- schema version;
- story-contract version;
- target-length configuration;
- repair version;
- simulation versus production mode where required.

Full and Short outputs must never collide.

Different languages must never collide.

A changed canonical English source must invalidate downstream localizations.

Batch `custom_id` values must be unique and deterministic.

Batch import must not rely on response order.

Before writing a batch result, validate:

- expected episode;
- expected language;
- expected format;
- expected stage;
- source hash;
- prompt version.

Do not overwrite a successful artifact with a malformed retry result.

---

# 12. Prompt and response logging

Preserve or improve existing OpenAI/provider logging.

For every story-related provider call, log:

- episode ID;
- stage;
- format;
- source language;
- target language;
- model;
- reasoning configuration;
- prompt version;
- schema version;
- cache key;
- source path;
- source hash;
- complete request excluding secrets;
- complete response;
- response status;
- finish reason;
- token usage;
- parsed output;
- validation result;
- repair result.

Continue excluding base64 image data.

Logging must also work in simulation mode so prompt construction can be inspected without paid provider calls.

Store logs in the existing episode debug directory convention.

---

# 13. Episode 030 protected elements

Use Episode 030 as a fixture with at least these protected elements.

## Characters

- Clara Voss
- David

## Core objects

- portrait;
- painted woman;
- window;
- ultraviolet scan or ultraviolet light;
- five earlier versions;
- Clara’s red mug;
- David’s silver watch;
- painted window;
- wet varnish;
- canvas;
- white opaque primer;
- museum scan or later scan.

## Required events

- the painted woman originally faces the window;
- after cleaning, she turns toward the room;
- ultraviolet inspection reveals earlier versions;
- the woman is closer in each earlier version;
- real studio objects appear inside the painting;
- cameras and scanners participate in the observation rule;
- David disappears during a power cut;
- David appears behind the painted woman;
- removing the canvas reveals a doorway-like opening;
- Clara enters the painted room;
- Clara navigates using indirect reflections;
- painted hands press through the canvas;
- Clara retrieves David;
- the work is sealed beneath white primer;
- the later scan shows the woman beneath the white layer;
- Clara’s red mug appears inside the painted world.

## Supernatural rule

Preserve one internally consistent version of the rule.

The implementation may refine the final wording, but the generated story must not contradict itself.

A suitable canonical rule is:

> The painted woman can move when her face is directly observed. Human eyes, cameras, and scanners count as direct observation. Indirect reflections allow Clara to perceive the room without giving the woman a direct observer.

If the existing approved story uses a different canonical rule, preserve that rule instead and update the contract accordingly.

## Emotional cost

Strengthen Clara’s responsibility for David’s disappearance.

Prefer a causal relationship such as:

- David warned her to stop;
- Clara ordered one final scan;
- the scan triggered the escalation;
- Clara enters the painting because her decision trapped him.

Do not introduce this blindly if it conflicts with established episode canon. Integrate it during the canonical English rewrite and then protect it across localizations.

---

# 14. Quality-scoring model

Extend or reuse the existing quality evaluation system.

Score each story independently on:

```ts
type StoryQualityScore = {
  hook: number;
  concreteImagery: number;
  supernaturalRuleConsistency: number;
  escalation: number;
  characterMotivation: number;
  emotionalCost: number;
  climaxClarity: number;
  endingStrength: number;
  narrationNaturalness: number;
  localizationFidelity?: number;
  visualProducibility: number;
  templateLanguageAbsence: number;
};
```

Scores should use a 1–10 scale.

Suggested minimums:

- hook: 8;
- concrete imagery: 8;
- rule consistency: 8;
- escalation: 8;
- character motivation: 7;
- emotional cost: 7;
- climax clarity: 8;
- ending strength: 8;
- narration naturalness: 8;
- localization fidelity: 8;
- visual producibility: 8;
- template-language absence: 8.

Do not treat a model-generated score as sufficient proof of quality.

Combine scoring with hard invariant validation.

A story must be blocked when:

- any critical invariant is missing;
- final reveal is materially changed;
- localization fidelity is below the threshold;
- rule consistency is below the threshold;
- output is incomplete;
- severe length mismatch exists;
- wrong language is detected.

---

# 15. Tests

Add or update tests using existing test conventions.

At minimum, cover:

## Source routing

- full localization receives canonical English full narration;
- Short localization receives canonical English Short narration;
- localized full output cannot use a Short profile;
- localized Short output cannot use a full profile accidentally.

## Cache and batch identity

- full and Short cache keys differ;
- each language has a different cache key;
- source-content changes invalidate dependent caches;
- batch custom IDs are unique;
- out-of-order batch responses map correctly;
- wrong-language or wrong-format batch results are rejected.

## Prompt construction

- localization prompt contains the complete canonical narration;
- localization prompt contains the story contract;
- localization prompt prohibits summarization;
- full prompt contains full target-length constraints;
- Short prompt contains Short-specific beat constraints;
- final narration prompt does not include production-note instructions as narratable content.

## Parsing

- complete narration is not replaced by a summary field;
- Markdown extraction preserves all narration paragraphs;
- malformed structured output fails safely;
- incomplete responses are rejected;
- raw-response and parsed-output lengths are compared.

## Validation

- missing final reveal blocks;
- missing protagonist blocks;
- missing required object is reported;
- contradictory rule blocks;
- severe word-count compression blocks;
- wrong narration language blocks;
- template commentary is reported;
- abstract placeholder density is reported;
- correct story passes.

## Repair

- targeted repair does not rewrite unaffected sections;
- repair cannot reduce a full localization below minimum length ratio;
- repaired output is revalidated;
- pre-repair artifact is preserved;
- missing ending can be restored without replacing the whole story.

## Metadata

- word count is computed from final narration;
- duration uses localized word count;
- title is in target language;
- SEO description is in target language;
- narration instruction names the target language;
- language code matches output path.

## Episode 030 regression fixture

Create fixtures or snapshots that verify all required Episode 030 elements survive:

- English full rewrite;
- English Short derivation;
- German full localization;
- Spanish full localization;
- French full localization;
- Portuguese full localization;
- all four localized Shorts.

Avoid tests that require exact prose equality.

Test semantic invariants and structural requirements.

---

# 16. CLI and diagnostics

Reuse existing CLI conventions.

Add a diagnostic or validation command only if equivalent functionality does not already exist.

A useful command shape could be:

```bash
story quality validate \
  --episode 030-the-woman-inside-the-painting \
  --all-languages \
  --all-formats \
  --explain
```

or adapt to the repository’s existing CLI structure.

The command should report:

- file;
- language;
- format;
- actual word count;
- expected word range;
- source/target ratio;
- detected language;
- invariant failures;
- template-language findings;
- metadata mismatches;
- quality scores;
- final status.

Provide machine-readable output where the current CLI supports it.

---

# 17. Documentation

Update the relevant repository documentation.

Document:

- canonical English source rules;
- full versus Short routing;
- faithful localization contract;
- story invariants;
- repair behavior;
- quality gates;
- metadata generation order;
- cache invalidation;
- debugging;
- simulation-mode inspection;
- batch-result validation.

Create or update a focused document such as:

`docs/story-rewrite-quality.md`

Use the project’s existing documentation structure if a better location already exists.

---

# 18. Migration and backward compatibility

Do not silently rewrite all existing episodes.

Provide a safe migration strategy.

Recommended behavior:

1. New pipeline version applies to newly generated or explicitly regenerated stories.
2. Existing artifacts can be validated without modification.
3. Regeneration requires an explicit command or flag.
4. Old cache entries are invalidated through versioned keys rather than deleted indiscriminately.
5. Existing production artifacts remain recoverable.
6. Before overwriting a story, preserve the previous version according to existing project conventions.

If the project already has production-state migrations, integrate with them.

---

# 19. Required implementation plan

Before modifying code, identify:

- current canonical source selection;
- prompt builders;
- full and Short profile selection;
- localization service;
- validation service;
- repair service;
- metadata writer;
- cache-key builder;
- batch custom-ID builder;
- debug logger;
- output writer;
- CLI entry points;
- existing tests.

Then implement in safe batches.

Suggested order:

## Batch A: routing and identity

- canonical source selection;
- full/Short profile separation;
- cache-key hardening;
- batch identity validation.

## Batch B: typed story contract

- reuse or extend existing story-bible/protected-elements structures;
- version and persist canonical invariants.

## Batch C: prompt improvements

- English full prompt;
- English Short prompt;
- faithful localization prompt;
- targeted repair prompt.

## Batch D: validation

- length;
- language;
- invariant preservation;
- rule consistency;
- final reveal;
- template leakage;
- abstract-language density.

## Batch E: repair safety

- targeted repair;
- before/after validation;
- no destructive compression.

## Batch F: metadata correctness

- recompute after final narration;
- language-specific instructions;
- localized title and SEO.

## Batch G: tests and fixtures

- Episode 030;
- routing;
- cache;
- batch;
- parsing;
- validation;
- repair;
- metadata.

## Batch H: documentation and rollout

- diagnostics;
- docs;
- migration notes;
- rollback procedure.

Combine batches only where changes are tightly coupled and safe.

---

# 20. Acceptance criteria

The implementation is complete only when all of the following are true.

## English full stories

- first impossible detail appears immediately;
- no production-note or story-analysis language appears in narration;
- scenes contain concrete actions and objects;
- supernatural rule remains consistent;
- protagonist has a concrete emotional cost;
- climax uses the established rule;
- ending stops on a concrete final reveal.

## English Shorts

- generated from the approved English full story;
- preserves the core rule;
- preserves personal consequence;
- preserves active climax;
- preserves final reveal;
- contains no generic aftermath filler.

## Full localizations

- generated from the canonical English full narration;
- normally retain at least 85% of the source word count;
- preserve every required character, object, event, rule, climax action, and final reveal;
- read naturally in the target language;
- are not summaries or outlines;
- pass target-language detection;
- use correct localized metadata.

## Short localizations

- generated from the canonical English Short;
- preserve all required beats;
- preserve the same ending;
- remain within configured duration;
- avoid generic compression language.

## Validation and safety

- incomplete provider responses are rejected;
- parsed truncation is detected;
- severe length mismatch blocks;
- wrong language blocks;
- missing ending blocks;
- contradictory rule blocks;
- repair cannot silently destroy a complete story;
- metadata is based on final narration;
- failed stories do not proceed to TTS or rendering.

## Observability

- every story-generation request is traceable;
- prompt versions are visible;
- source hashes are visible;
- raw and parsed output can be compared;
- validation and repair outcomes are logged;
- simulation mode logs prompts without paid calls;
- base64 image content remains excluded.

---

# 21. Final verification

Run the repository’s relevant:

- typecheck;
- lint;
- unit tests;
- integration tests;
- prompt snapshot tests;
- CLI validation tests.

Then run the improved quality validator against Episode 030.

Do not claim Episode 030 is fixed merely because tests pass.

Report:

- which current files fail and why;
- which failures are expected from legacy output;
- what regeneration command is required;
- whether regeneration can be simulated;
- whether a paid provider call is needed;
- expected full and Short source ranges;
- expected localization ratios;
- protected elements found and missing.

If safe and supported by the repository, regenerate Episode 030 in simulation mode first.

Do not overwrite production story files with simulated placeholder content.

---

# 22. Required final response

At the end, provide:

1. Summary of the implemented changes.
2. Root causes found in the existing pipeline.
3. Exact files changed.
4. Existing functionality reused.
5. New schemas or domain types introduced.
6. Prompt changes.
7. Validation and repair changes.
8. Cache and batch identity changes.
9. Metadata changes.
10. Tests added or updated.
11. Commands executed and results.
12. Episode 030 validation results before and after.
13. Any production regeneration commands required.
14. Migration and rollback notes.
15. Remaining risks or unresolved issues.

Be precise and evidence-based.

Do not conceal partial failures.

Do not broadly refactor unrelated code.
