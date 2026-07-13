# Codex Prompt: Audit and Refactor the Entire Repository, Eliminate Duplicate Implementations, and Refresh the AI Content Pack

## Role

Act as a principal TypeScript platform architect, workflow-engine designer, YouTube content strategist, horror narrative editor, visual-continuity supervisor, educational-media designer, and production-quality auditor.

You are working in an existing repository that produces two distinct classes of YouTube content:

1. **Dark Truth** — multilingual horror, dark mystery, supernatural documentary-style stories, full videos and Shorts.
2. **Mathematics Education** — curriculum-aligned educational videos for school students, including explainers, examples, visual demonstrations, exercises, Shorts, and potentially teacher-facing assets.

Your task is to inspect the entire repository, identify architectural and content-quality weaknesses, produce a repository-grounded migration plan, and then implement that plan in small, safe, independently verifiable batches. The final result must eliminate duplicate production implementations rather than merely documenting them.

The final system must produce content that is highly compelling for each target audience without collapsing both systems into one generic content template.

Begin with a read-only audit and baseline. Do not modify production code until the duplicate inventory, canonical boundaries, compatibility strategy, and safe batch plan have been written. After that gate, implement the refactor, migrate all callers, remove obsolete implementations when proven unused, validate the entire repository, and refresh the AI content pack.

---

# 1. Core objective

Design one reliable production platform with:

- one canonical implementation per production task;
- one shared workflow engine;
- genre-specific workflow profiles;
- resumable and idempotent execution;
- task-level and artifact-level caching;
- safe batching;
- deterministic artifact paths;
- explicit workflow state;
- immutable execution history;
- manual operator overrides;
- strong observability;
- content-quality gates appropriate to each audience;
- strict TypeScript contracts;
- compatibility with existing episodes and commands.

The system must support:

- CLI execution;
- complete episode workflows;
- individual task execution;
- batch execution;
- Codex-directed operation;
- recovery and repair commands;
- dry-run execution;
- explicit operator approval before publishing;
- full-length videos and Shorts;
- English, German, Spanish, French, and Portuguese;
- future additional genres without duplicating orchestration infrastructure.

---

# 2. Non-negotiable architectural principle

There must be exactly one application-layer implementation for each logical production task.

Codex instructions, npm scripts, CLI commands, batch commands, repair tools, tests, and complete workflows must all invoke the same canonical task implementation.

No entry point may:

- construct its own artifact paths;
- duplicate business logic;
- use alternate prompt templates without an explicit versioned profile;
- bypass workflow state;
- bypass artifact validation;
- silently overwrite valid outputs;
- directly write production artifacts to inferred locations;
- mark tasks successful merely because a file exists.

Audit the current repository for violations of this principle.

---

# 3. Known problem to investigate

When stories, audio, videos, thumbnails, images, metadata, or other artifacts are generated through Codex versus the normal CLI, the repository appears to use multiple implementations with different:

- paths;
- filenames;
- directory structures;
- naming conventions;
- prompt sources;
- configuration sources;
- retry behavior;
- cache behavior;
- logging;
- validation;
- provider invocation;
- overwrite rules;
- state tracking.

Trace and document all such divergences.

---

# 4. Shared platform, separate content systems

The horror and mathematics systems must share infrastructure, not creative policy.

Shared platform responsibilities should include:

- task registration;
- dependency resolution;
- workflow state;
- retries;
- locking;
- atomic writes;
- caching;
- batching;
- provider abstractions;
- artifact storage;
- structured logs;
- cost reporting;
- CLI behavior;
- dry-run support;
- manual approvals;
- state reconciliation;
- migration compatibility.

Genre-specific profiles must define:

- workflow DAG;
- prompts;
- content contracts;
- audience;
- quality gates;
- visual language;
- pacing;
- narration style;
- allowed task variants;
- required artifact types;
- validation rules;
- failure thresholds;
- approval policy.

Do not create a generic “one prompt fits all” content layer.

---

# 5. Dark Truth content system

## 5.1 Target audience and content promise

Dark Truth targets viewers who want unsettling, cinematic, believable horror and dark mystery content.

The content should feel:

- specific rather than generic;
- tense rather than noisy;
- cinematic without becoming purple prose;
- emotionally costly;
- visually memorable;
- narratively coherent;
- internally consistent;
- suitable for a restrained dark-documentary narration style;
- optimized for retention without relying on cheap clickbait;
- appropriate for full videos and Shorts;
- consistent across languages.

The system must preserve the established production identity:

- single adult male narration;
- restrained dark-documentary delivery;
- approximately 175–185 words per minute unless explicitly overridden;
- calm opening;
- escalating tension;
- slower delivery at reveals;
- brief silence before the last line;
- subtle recurring sound motif;
- no dependence on loud jumpscares;
- usually no more than three central characters;
- avoid minors unless specifically justified and approved;
- one focal subject and one primary threat;
- one clear supernatural rule;
- visually active opening;
- concrete sensory escalation;
- an emotionally costly final decision;
- a memorable final image or final line.

## 5.2 Story bible is a first-class artifact

The Dark Truth system must have a versioned, validated, canonical story-bible system.

Audit whether one already exists, how it is used, and whether any commands bypass it.

Design at least these artifact types:

- channel story bible;
- genre bible;
- narrative voice guide;
- visual style bible;
- recurring-world canon;
- episode bible;
- character bible;
- location bible;
- threat or entity bible;
- continuity manifest;
- forbidden-pattern register;
- localization notes;
- pronunciation guide;
- reference-image manifest.

The story bible must define, where applicable:

- channel identity;
- tone;
- narration style;
- audience boundaries;
- recurring themes;
- banned clichés;
- banned repeated phrases;
- supernatural-rule policy;
- character limits;
- escalation model;
- ending policy;
- visual continuity rules;
- thumbnail identity;
- audio style;
- localization constraints;
- canon and continuity rules;
- reusable locations or entities;
- safety and platform constraints.

The episode bible must define:

- canonical title;
- logline;
- premise;
- protagonist;
- supporting characters;
- threat;
- location;
- timeline;
- supernatural rule;
- character motivations;
- emotional cost;
- reveal structure;
- escalation ladder;
- key visual moments;
- ending;
- continuity constraints;
- required reference images;
- prohibited deviations;
- pronunciation notes;
- language-specific adaptation notes.

Every downstream Dark Truth task must receive the relevant bible revision or its fingerprint as an explicit input.

If a story, shot plan, image, thumbnail, localization, audio instruction, metadata artifact, or video was produced with an outdated bible revision, the workflow must be able to explain whether it is stale and which downstream tasks should be invalidated.

## 5.3 Reference images are mandatory workflow artifacts for Dark Truth

Reference images are not optional decoration. They are part of the continuity system.

Design a reference-image workflow that can include:

- protagonist reference;
- supporting-character reference;
- threat or entity reference;
- hero location reference;
- recurring prop reference;
- palette and lighting reference;
- camera-language reference;
- thumbnail composition reference;
- aspect-ratio-specific references;
- full-video reference set;
- Shorts reference set when required.

The system must:

- generate or import references before dependent scene images;
- validate required reference coverage;
- version reference images;
- calculate checksums;
- record their provider, model, prompt version, and seed-like metadata where available;
- bind scene images and thumbnails to the exact reference set used;
- prevent silent substitution of a character face or visual identity;
- support explicit operator approval of references;
- support reference replacement and downstream invalidation;
- support reference-image reuse across scenes;
- distinguish canonical references from inspiration-only images;
- record usage rights or origin metadata for imported references where practical;
- avoid storing large base64 payloads inside normal JSON logs.

A Dark Truth visual task must not be marked ready if required reference images are missing, unapproved, corrupt, or inconsistent with the episode bible, unless the operator records an explicit override.

Create a proposed `ReferenceImageManifest` type and schema.

## 5.4 Dark Truth content-quality pipeline

Design explicit tasks and gates for:

1. concept selection;
2. premise uniqueness;
3. episode-bible creation;
4. story outline;
5. canonical English full-story rewrite;
6. structural validation;
7. horror-quality review;
8. repetition and cliché detection;
9. continuity validation against the story bible;
10. emotional-cost validation;
11. supernatural-rule validation;
12. opening-retention validation;
13. final-line or final-image validation;
14. operator approval when required;
15. localization;
16. localized quality validation;
17. Shorts derivation;
18. Shorts-specific retention validation;
19. shot planning;
20. reference-image planning;
21. reference-image generation or import;
22. reference-image approval;
23. scene-image generation;
24. visual continuity validation;
25. thumbnail concept generation;
26. thumbnail generation;
27. thumbnail validation;
28. narration instructions;
29. audio generation;
30. audio validation;
31. captions;
32. video rendering;
33. audiovisual QA;
34. metadata;
35. publish dry-run;
36. operator approval;
37. publishing.

Distinguish tasks that are deterministic, model-assisted, provider-dependent, manually approved, or irreversible.

## 5.5 Dark Truth quality scoring

Recommend a typed scoring model with hard gates and weighted scores.

Assess at least:

- hook strength;
- first-20-second visual potential;
- premise originality;
- specificity;
- character motivation;
- escalation quality;
- supernatural-rule clarity;
- emotional cost;
- scene-to-scene causality;
- sensory detail;
- dialogue restraint;
- repetition;
- cliché density;
- final reveal;
- final line;
- narratability;
- thumbnail potential;
- full-video retention potential;
- Shorts retention potential;
- translation resilience;
- visual continuity readiness;
- policy and platform suitability.

Do not allow a high aggregate score to conceal a hard failure.

Hard failures should include examples such as:

- unclear supernatural rule;
- contradiction with the episode bible;
- generic repeated template paragraphs;
- inconsistent character identity;
- missing emotional cost;
- implausible ending caused only by arbitrary character behavior;
- missing required reference images;
- broken localization;
- invalid artifact;
- failed mathematical or factual claim where applicable;
- publish approval missing.

Use statuses compatible with:

- READY;
- READY_WITH_MINOR_EDITS;
- REVISION_REQUIRED;
- REWRITE_REQUIRED;
- BLOCKED.

Define exact semantics and machine-readable reason codes.

---

# 6. Mathematics education content system

## 6.1 Target audience and content promise

The education system must create compelling, trustworthy, age-appropriate mathematics content aligned to the selected curriculum, school type, grade, language, and learning objective.

It should not imitate the horror system’s pacing or emotional manipulation.

Its content should be compelling through:

- curiosity;
- clear relevance;
- achievable challenge;
- visual understanding;
- misconception resolution;
- progressive mastery;
- short feedback loops;
- concrete examples;
- confidence-building;
- satisfying insight;
- accurate and concise explanations;
- opportunities for active participation.

The default audience may include students in German schools, but the design must support explicit configuration for:

- country or state;
- curriculum source;
- school type;
- grade;
- age range;
- language;
- prior knowledge;
- accessibility needs;
- lesson length;
- full lesson versus Short;
- student-facing versus teacher-facing output.

Do not hard-code one grade or one German federal state unless the repository already requires it.

## 6.2 Reference images are secondary for education

Reference images may be useful for:

- recurring mascots;
- teacher avatars;
- branded lesson series;
- real-world scenarios;
- consistent diagrams;
- recurring environments;
- thumbnail identity.

However, they are less important than they are for Dark Truth.

The mathematics system should prioritize:

- deterministic diagrams;
- reusable visual templates;
- graphs;
- coordinate systems;
- geometric constructions;
- symbolic rendering;
- animations;
- step-by-step transformations;
- accessibility;
- typography;
- color-independent meaning;
- curriculum alignment.

Reference images should be optional unless a specific educational profile declares them required.

Design an `EducationalVisualStyleManifest` that emphasizes reusable layout, diagram, animation, typography, and accessibility rules rather than character-image continuity.

## 6.3 Mathematics content-quality pipeline

Design explicit tasks and gates for:

1. curriculum-source selection;
2. curriculum extraction and normalization;
3. learning-objective selection;
4. prerequisite analysis;
5. lesson specification;
6. misconception inventory;
7. pedagogical strategy;
8. example generation;
9. deterministic mathematical validation;
10. explanation generation;
11. cognitive-load review;
12. age and language-level review;
13. storyboard;
14. visual specification;
15. deterministic visual rendering where possible;
16. narration script;
17. practice questions;
18. worked solutions;
19. formative checks;
20. captions;
21. audio;
22. video rendering;
23. mathematical QA;
24. pedagogical QA;
25. accessibility QA;
26. metadata;
27. publish dry-run;
28. operator approval;
29. publishing.

The workflow should support deterministic Linux-based visual generation where practical.

Prefer tools and methods such as:

- SVG;
- LaTeX;
- MathJax or KaTeX where appropriate;
- SymPy;
- Python plotting;
- FFmpeg;
- ImageMagick;
- Mermaid only where suitable;
- reusable animation templates;
- programmatic coordinate geometry;
- deterministic slide or frame rendering.

Do not mandate a tool without inspecting the repository.

## 6.4 Mathematics quality scoring

Assess at least:

- curriculum alignment;
- mathematical correctness;
- prerequisite fit;
- learning-objective clarity;
- explanation clarity;
- cognitive load;
- pacing;
- worked-example quality;
- misconception handling;
- visual-semantic accuracy;
- exercise quality;
- solution quality;
- age appropriateness;
- language level;
- accessibility;
- retention potential;
- transfer to new problems;
- assessment validity;
- metadata relevance.

Hard failures must include:

- mathematically incorrect statement;
- invalid worked solution;
- unverified symbolic result when deterministic verification is possible;
- mismatch with selected curriculum;
- missing prerequisite explanation;
- visually misleading diagram;
- inaccessible essential information;
- exercise not solvable from taught material;
- answer key disagreement;
- unsupported learning claim;
- publish approval missing.

---

# 7. Design an audience-aware content contract

Create a shared but profile-specific content contract.

The contract must include:

- `ContentProfile`;
- `AudienceDefinition`;
- `LearningOrNarrativeObjective`;
- `EngagementStrategy`;
- `QualityGateDefinition`;
- `HardFailureRule`;
- `ScoringDimension`;
- `VisualPolicy`;
- `NarrationPolicy`;
- `LocalizationPolicy`;
- `ApprovalPolicy`;
- `ArtifactRequirement`;
- `ReferencePolicy`.

Use strict TypeScript, discriminated unions, and schema validation.

For example, distinguish profiles with a union similar to:

```ts
type ContentProfile =
  | DarkTruthContentProfile
  | MathematicsEducationContentProfile;
```

Do not rely on unvalidated free-form profile names.

---

# 8. Workflow engine and task DAG

Design a generic workflow engine that supports genre-specific DAGs.

Each task definition should include:

- stable task ID;
- task version;
- profile applicability;
- required dependencies;
- optional dependencies;
- input artifact contracts;
- output artifact contracts;
- readiness predicate;
- cache policy;
- retry policy;
- timeout policy;
- lock scope;
- approval policy;
- validation policy;
- invalidation policy;
- batching policy;
- provider policy;
- CLI command representation;
- observability fields;
- cost-accounting behavior.

Propose strict TypeScript interfaces for:

- `TaskDefinition`;
- `TaskExecutionContext`;
- `TaskInput`;
- `TaskResult`;
- `TaskAttempt`;
- `TaskDependency`;
- `TaskFingerprint`;
- `ArtifactRef`;
- `ArtifactManifest`;
- `WorkflowDefinition`;
- `WorkflowInstance`;
- `WorkflowEvent`;
- `OperatorOverride`;
- `ApprovalRecord`;
- `BatchManifest`;
- `ReferenceImageManifest`;
- `StoryBibleManifest`;
- `EducationalVisualStyleManifest`;
- `QualityAssessment`;
- `HardFailure`;
- `ScoringResult`.

---

# 9. Canonical artifact repository

No command or service may construct production paths by ad hoc string concatenation.

Design a central artifact repository and path resolver.

Artifact references should describe intent, for example:

- episode;
- content profile;
- locale;
- variant;
- artifact kind;
- artifact revision;
- workflow revision;
- bible revision;
- reference-set revision.

Audit all current artifact producers and consumers.

Produce a matrix containing:

- conceptual artifact;
- existing paths;
- existing filenames;
- producing commands;
- consuming commands;
- horror usage;
- mathematics usage;
- full usage;
- Shorts usage;
- locale behavior;
- canonical proposed path;
- legacy fallback;
- migration risk.

The migration must not require a big-bang move of existing episodes.

Support:

- legacy artifact discovery;
- canonical writes for new outputs;
- conflict detection;
- optional migration commands;
- dry-run migration;
- rollback;
- artifact verification;
- checksums;
- atomic writes.

---

# 10. Workflow state and audit history

The operator wants a human-readable state similar to:

```json
{
  "done": [
    {
      "task": "story.rewrite.full",
      "date": "...",
      "exitCode": 0,
      "errors": [],
      "cliCommand": "..."
    }
  ],
  "next": [
    {
      "task": "story.quality-check",
      "cliCommand": "mediaforge task run story.quality-check --episode 025"
    }
  ]
}
```

Improve this design.

Do not store `done` and `next` as independent sources of truth.

`next` must be derived from:

- task states;
- dependencies;
- workflow profile;
- locale;
- variant;
- approvals;
- artifacts;
- invalidations;
- cache status;
- operator overrides.

Design a state model with statuses such as:

- pending;
- ready;
- blocked;
- running;
- succeeded;
- failed;
- interrupted;
- skipped;
- invalidated;
- awaiting-approval.

Recommend a structure similar to:

```text
episodes/<episode>/workflow/
├── state.json
├── events.jsonl
├── overrides.json
├── approvals.json
└── runs/
```

Evaluate the actual repository before finalizing paths.

Requirements:

- `state.json` is a materialized current state;
- `events.jsonl` is append-only and auditable;
- `overrides.json` is explicitly operator-editable;
- approvals are explicit and attributable;
- direct manual edits are schema-validated;
- stale revisions are detected;
- impossible transitions are rejected;
- missing required artifacts are detected;
- manual success overrides require reasons;
- immutable history is preserved.

---

# 11. CLI design

Audit the complete CLI and all npm or helper-script entry points.

Recommend a consistent `resource action` command hierarchy.

Evaluate commands similar to:

```bash
mediaforge episode list
mediaforge episode status --episode <id>
mediaforge episode next --episode <id>
mediaforge episode graph --episode <id>
mediaforge episode plan --episode <id>
mediaforge episode run-next --episode <id>
mediaforge episode run --episode <id>
mediaforge episode run --episode <id> --through <task>
mediaforge episode run --episode <id> --from <task>
mediaforge episode resume --episode <id>
mediaforge episode reconcile --episode <id>
mediaforge episode retry-failed --episode <id>
mediaforge episode invalidate --episode <id> --task <task>
mediaforge episode validate-state --episode <id>
mediaforge episode override --episode <id> --task <task> --status <status> --reason <reason>

mediaforge task list
mediaforge task explain <task>
mediaforge task run <task> --episode <id>

mediaforge batch plan
mediaforge batch run
mediaforge batch status
mediaforge batch resume
mediaforge batch reconcile

mediaforge artifact list
mediaforge artifact verify
mediaforge artifact migrate

mediaforge bible validate
mediaforge bible diff
mediaforge references status
mediaforge references approve
mediaforge references invalidate

mediaforge cache inspect
mediaforge cache explain-miss
mediaforge cache prune

mediaforge workflow validate
mediaforge config explain
mediaforge doctor
```

These are examples. Compare them with the repository and recommend final names.

Specify:

- final command tree;
- help text strategy;
- examples;
- aliases;
- deprecated commands;
- JSON output;
- dry-run behavior;
- stable exit codes;
- shell completion;
- actionability of errors;
- command discoverability;
- compatibility wrappers.

`run-next` should run one logical task by default unless an explicit continuation flag is provided.

---

# 12. Idempotency and caching

Every task must be safely repeatable.

Design task fingerprints based on relevant inputs such as:

- task implementation version;
- normalized configuration;
- input artifact hashes;
- story-bible revision;
- episode-bible revision;
- reference-image-set revision;
- educational visual-style revision;
- prompt-template hash;
- provider;
- model;
- model parameters;
- locale;
- variant;
- workflow profile;
- tool versions;
- curriculum revision;
- deterministic-renderer version.

A cache hit requires:

- matching fingerprint;
- previously successful task;
- valid output manifest;
- all output artifacts present;
- output validation passed;
- no explicit invalidation;
- no stale required dependency.

A file merely existing is insufficient.

Explain differences in cacheability for:

- prompts;
- stories;
- localization;
- reference images;
- scene images;
- thumbnails;
- audio;
- captions;
- deterministic mathematics visuals;
- video rendering;
- metadata.

Design dependency-based invalidation.

Changing a Dark Truth reference image must invalidate dependent images, thumbnails, and possibly videos, but should not automatically invalidate unrelated story text.

Changing a mathematics curriculum objective should invalidate lesson content, examples, exercises, visuals, audio, and rendering as appropriate.

---

# 13. Resumability and reliability

Design for:

- one-host execution today;
- future multi-worker compatibility;
- process crashes;
- machine restarts;
- provider timeouts;
- interrupted network calls;
- valid outputs created before state update;
- state update before output promotion;
- partial batches;
- stale locks;
- operator repair;
- graceful shutdown.

Include:

- per-episode locks;
- per-task locks;
- atomic writes;
- temporary files;
- atomic promotion;
- attempt records;
- stale-run detection;
- reconciliation;
- task heartbeats or leases only if justified;
- deterministic task IDs;
- deterministic batch-item IDs;
- retry classification;
- cancellation semantics.

Do not over-engineer distributed coordination for the current single-host model.

---

# 14. Batch execution

Batch execution must reuse normal task implementations.

Design:

- batch manifests;
- item-level state;
- partial success;
- independent retries;
- resume;
- reconciliation;
- cache interaction;
- grouping by provider, model, locale, variant, and operation;
- provider request IDs;
- rate-limit handling;
- concurrency controls;
- cost reporting;
- failure payload preservation;
- operator cancellation.

One failed item must not cause successful items to be regenerated.

Inspect existing limits and configuration. Values such as audio concurrency one, image concurrency two, and image retries two may be current defaults, but do not hard-code them without repository evidence.

---

# 15. Artifact validation

Recommend validation before a producing task is marked successful.

Dark Truth examples:

- story and episode bible schemas;
- continuity;
- reference-image coverage;
- image dimensions;
- face or character consistency checks where feasible;
- thumbnail dimensions and text safety;
- audio decodability and duration;
- silence or distortion checks;
- caption timing;
- video resolution, duration, and streams;
- metadata constraints.

Mathematics examples:

- curriculum mapping;
- symbolic correctness;
- answer-key consistency;
- graph correctness;
- geometry constraints;
- visual-semantic consistency;
- age-appropriate language;
- accessible typography;
- caption timing;
- video properties;
- metadata constraints.

Explain which validation belongs inside the producer and which should be an explicit dependent gate.

---

# 16. Observability

All executions should emit structured records including:

- run ID;
- batch ID;
- episode ID;
- profile;
- task ID;
- attempt ID;
- locale;
- variant;
- provider;
- model;
- provider request ID;
- cache status;
- duration;
- input fingerprint;
- story-bible revision;
- reference-set revision;
- curriculum revision;
- output artifacts;
- warnings;
- normalized errors;
- exit code;
- token usage;
- estimated and actual cost where available.

Review current debug logging.

Preserve useful provider request and response data while excluding:

- secrets;
- authentication material;
- large base64 payloads;
- binary media;
- unnecessary personal data.

Define the relationship among:

- workflow events;
- structured operational logs;
- provider debug logs;
- artifact manifests;
- user-facing CLI output.

---

# 17. Error and exit-code contracts

Design a typed error taxonomy for:

- configuration error;
- schema validation error;
- missing dependency;
- missing artifact;
- invalid story bible;
- invalid reference set;
- continuity conflict;
- mathematical validation failure;
- curriculum mismatch;
- provider authentication;
- provider rate limit;
- provider transient failure;
- provider permanent rejection;
- filesystem failure;
- cache corruption;
- workflow conflict;
- lock conflict;
- approval required;
- interrupted execution;
- partial batch failure;
- artifact validation failure.

Recommend stable CLI exit codes and concise actionable operator messages.

---

# 18. Repository audit requirements

Inspect at least:

- root and workspace `package.json` files;
- CLI registration and command implementations;
- standalone scripts;
- shell scripts;
- provider adapters;
- prompt directories;
- story-bible files;
- reference-image code;
- image and thumbnail generators;
- audio generators;
- rendering code;
- metadata code;
- workflow code;
- batch code;
- tests;
- documentation;
- Codex instructions;
- agent files;
- legacy commands;
- migrations;
- filesystem writers;
- path utilities.

For every material current-state claim include:

- file path;
- symbol or command;
- line reference where possible;
- observed behavior;
- confidence level.

Clearly distinguish:

- verified repository fact;
- inference;
- recommendation;
- unresolved question.

If docs and executable code disagree, treat code and tests as stronger evidence and record the discrepancy.

---

# 19. Migration strategy

Do not recommend a big-bang rewrite.

Create small, independently verifiable implementation batches.

A likely sequence to evaluate is:

1. entry-point and artifact-path inventory;
2. typed artifact reference model;
3. central path resolver;
4. task registry facade around existing implementations;
5. workflow state and event log;
6. `status`, `next`, and `run-next`;
7. validation and atomic writes;
8. cache fingerprints and invalidation;
9. Dark Truth story-bible integration;
10. Dark Truth reference-image workflow;
11. Dark Truth quality gates;
12. mathematics curriculum and correctness gates;
13. deterministic education visual pipeline;
14. batch unification;
15. CLI cleanup and aliases;
16. migration utilities;
17. publishing approval gates;
18. removal of deprecated duplicate implementations after acceptance.

Adjust this order based on repository evidence.

For every batch include:

- objective;
- scope;
- files likely affected;
- prerequisites;
- implementation steps;
- compatibility behavior;
- tests;
- validation commands;
- rollback;
- risks;
- completion criteria.

---

# 20. Testing strategy

Recommend tests for:

- task registry;
- dependency resolution;
- task fingerprints;
- cache hits and misses;
- invalidation;
- workflow-state transitions;
- manual overrides;
- approvals;
- atomic writes;
- stale locks;
- crash recovery;
- `run-next`;
- batch partial failure;
- CLI parsing;
- help snapshots;
- exit codes;
- JSON output;
- legacy path compatibility;
- story-bible validation;
- episode-bible validation;
- reference-image manifest validation;
- reference replacement invalidation;
- visual continuity;
- Dark Truth story quality;
- Dark Truth Shorts quality;
- localization quality;
- curriculum alignment;
- symbolic mathematics validation;
- answer-key consistency;
- deterministic visual output;
- accessibility checks;
- full versus short workflows;
- multilingual execution.

Provider-dependent tests should be opt-in and clearly separated from deterministic tests.

---

# 21. Codex operating policy

Recommend repository instructions stating that Codex must normally invoke the canonical CLI.

Codex must not:

- infer output paths;
- directly generate production files outside the task engine;
- bypass story-bible inputs;
- bypass required reference images for Dark Truth;
- bypass mathematical correctness validation;
- mark tasks successful without validation;
- silently overwrite valid artifacts;
- create one-off duplicate production scripts;
- publish without explicit approval.

Codex may create analysis-only scripts when necessary, but they must not modify production artifacts.

---

# 22. Required deliverables

Create or adapt the following documents to the repository’s established documentation layout:

```text
docs/audits/mediaforge-entrypoint-inventory.md
docs/audits/mediaforge-duplicate-implementation-audit.md
docs/audits/mediaforge-artifact-path-audit.md
docs/audits/mediaforge-cli-ux-audit.md
docs/audits/mediaforge-workflow-reliability-audit.md
docs/audits/darktruth-story-bible-audit.md
docs/audits/darktruth-reference-image-audit.md
docs/audits/darktruth-content-quality-audit.md
docs/audits/mathematics-content-quality-audit.md

docs/architecture/mediaforge-target-architecture.md
docs/architecture/mediaforge-task-registry.md
docs/architecture/mediaforge-workflow-state.md
docs/architecture/mediaforge-cli-command-design.md
docs/architecture/mediaforge-artifact-layout.md
docs/architecture/mediaforge-caching-and-idempotency.md
docs/architecture/mediaforge-batching-and-resume.md
docs/architecture/audience-aware-content-profiles.md
docs/architecture/darktruth-story-bible-and-continuity.md
docs/architecture/darktruth-reference-image-workflow.md
docs/architecture/darktruth-quality-gates.md
docs/architecture/mathematics-quality-gates.md
docs/architecture/mathematics-visual-language.md

docs/plans/mediaforge-unification-implementation-plan.md
docs/plans/mediaforge-unification-safe-batches.md
docs/plans/mediaforge-compatibility-and-migration-plan.md
docs/plans/content-quality-implementation-plan.md
docs/plans/darktruth-bible-and-reference-image-plan.md
docs/plans/mathematics-content-quality-plan.md
docs/plans/mediaforge-unification-summary.md

docs/adr/ADR-mediaforge-unified-task-workflow-engine.md
docs/adr/ADR-darktruth-story-bible-and-reference-images.md
docs/adr/ADR-audience-specific-content-quality-profiles.md
```

If the repository uses different documentation conventions, adapt paths but preserve the deliverable intent.

The summary must include:

- highest-risk current divergences;
- canonical implementation boundaries;
- proposed CLI tree;
- workflow-state design;
- Dark Truth workflow;
- mathematics workflow;
- story-bible strategy;
- reference-image strategy;
- audience-specific quality model;
- recommended implementation order;
- unresolved decisions;
- first safe implementation batch.

---

# 23. Whole-repository execution scope

The scope is the entire repository, not only MediaForge commands already known to be duplicated.

Inspect all workspaces, packages, applications, libraries, scripts, CLIs, prompts, providers, workflow code, filesystem utilities, tests, documentation, agent instructions, migrations, compatibility code, and AI-pack tooling.

Specifically search for duplicate or divergent implementations of:

- domain types and schemas;
- configuration loading and environment parsing;
- CLI command registration and argument normalization;
- task orchestration;
- artifact path and filename construction;
- prompt loading and prompt versioning;
- provider invocation;
- retry and timeout handling;
- batching;
- cache keys and cache storage;
- state and log writing;
- story generation and rewriting;
- localization;
- story-bible handling;
- reference-image handling;
- image and thumbnail generation;
- audio and caption generation;
- video rendering;
- metadata and publishing;
- mathematics validation and educational rendering;
- repair, migration, and Codex helper scripts.

For every duplicate implementation:

1. identify all callers;
2. compare observable behavior;
3. classify the divergence and risk;
4. select or create a canonical implementation;
5. add characterization tests before changing behavior;
6. migrate every caller to the canonical implementation;
7. retain temporary compatibility adapters where needed;
8. verify output paths, schemas, logs, exit codes, and side effects;
9. remove obsolete production logic only when no active caller remains;
10. update documentation and the AI content pack.

Do not consider a wrapper that delegates to the canonical implementation to be harmful duplication. Do consider independently maintained business logic, path logic, provider logic, validation, or orchestration to be duplication.

# 24. Required execution phases

## Phase 0 — baseline and safety

Before modifying production code:

- inspect Git status and preserve unrelated local changes;
- identify package manager, workspaces, generated files, and build graph;
- determine canonical build, lint, typecheck, test, and smoke-test commands;
- locate current AI content-pack files and generation process;
- run a baseline validation pass;
- document pre-existing failures separately from introduced regressions;
- identify directories containing generated media or large binaries that must not be scanned or copied unnecessarily.

## Phase 1 — repository-wide audit

Produce the complete entry-point, implementation, artifact-path, CLI, workflow, configuration, provider, prompt, and AI-pack inventories required by this prompt.

Do not begin broad production changes before this phase is documented.

## Phase 2 — canonical architecture and safe batches

Finalize:

- canonical package boundaries;
- canonical task registry;
- canonical artifact repository and path resolver;
- canonical workflow state and event model;
- canonical CLI hierarchy;
- canonical provider interfaces;
- canonical prompt registry;
- canonical error taxonomy;
- canonical cache and batch models;
- Dark Truth story-bible and reference-image integration;
- Mathematics curriculum, correctness, and deterministic-visual integration;
- compatibility and rollback strategy.

Break implementation into small batches. Each batch must have explicit acceptance criteria, tests, validation commands, and rollback instructions.

## Phase 3 — foundational implementation

Implement the shared foundations first, adapting order to repository evidence:

1. typed artifact references and manifests;
2. centralized artifact path resolution with legacy lookup;
3. typed canonical task interfaces and task registry;
4. adapters around existing implementations;
5. canonical workflow state, append-only events, approvals, and overrides;
6. `status`, `next`, `run-next`, `resume`, and `reconcile` behavior;
7. atomic writes and artifact validation;
8. typed errors and stable CLI exit codes;
9. fingerprint-based cache and dependency invalidation;
10. batch manifests with item-level resume and retry;
11. structured observability and cost metadata.

## Phase 4 — production-task unification

For each task family, characterize current behavior, choose the canonical implementation, migrate all entry points, validate compatibility, and remove obsolete logic.

All of the following must delegate to the same canonical application-layer tasks:

- direct CLI commands;
- full workflows;
- batch workflows;
- npm scripts;
- Codex-directed commands;
- repair tools;
- migration tools;
- tests.

## Phase 5 — profile integration

Integrate the complete Dark Truth and Mathematics workflows on the shared engine while preserving separate audience, prompt, quality, visual, validation, and approval policies.

## Phase 6 — duplicate removal

Delete obsolete implementations only after:

- all known callers are migrated;
- characterization and regression tests pass;
- legacy commands delegate through compatibility wrappers or have an approved migration path;
- repository search finds no hidden active imports or invocations;
- artifact compatibility is verified.

Record every removal and retained compatibility adapter.

## Phase 7 — repository-wide validation

Run all applicable deterministic checks:

- builds;
- strict typechecks;
- lint;
- unit tests;
- integration tests;
- CLI tests and help snapshots;
- workflow-state tests;
- cache and invalidation tests;
- batch partial-failure and resume tests;
- legacy path and command compatibility tests;
- Dark Truth bible, reference, and quality-gate tests;
- Mathematics correctness, answer-key, visual, pedagogy, and accessibility tests;
- AI-pack generation and freshness tests;
- dead-code and duplicate-path scans where reliable.

Paid provider calls must remain opt-in and must not be run for this refactor unless explicitly authorized.

# 25. AI content-pack refresh

Locate the current AI content pack and audit:

- its directory and naming conventions;
- whether it is generated or manually maintained;
- manifest and source-index support;
- source freshness;
- duplicated or obsolete content;
- missing architecture, workflow, CLI, and operational information;
- accidental inclusion of secrets, binaries, base64, or generated media;
- practical upload size and chunking requirements.

After the repository refactor is complete, rebuild or update the AI content pack so it accurately reflects the final source of truth.

The pack must be curated rather than a blind repository dump. It should allow ChatGPT to understand the system without needing generated media or dependency directories.

Include content equivalent to:

```text
ai-content-pack/
├── README.md
├── MANIFEST.json
├── repository-map.md
├── source-index.json
├── architecture/
│   ├── system-overview.md
│   ├── package-boundaries.md
│   ├── task-registry.md
│   ├── workflow-engine.md
│   ├── artifact-layout.md
│   ├── workflow-state.md
│   ├── caching-and-invalidation.md
│   ├── batching-and-resume.md
│   ├── providers.md
│   └── observability.md
├── cli/
│   ├── command-reference.md
│   ├── common-workflows.md
│   ├── recovery.md
│   └── deprecated-commands.md
├── profiles/
│   ├── darktruth.md
│   └── mathematics-education.md
├── darktruth/
│   ├── story-bible.md
│   ├── reference-images.md
│   ├── visual-continuity.md
│   ├── quality-gates.md
│   ├── full-workflow.md
│   └── shorts-workflow.md
├── mathematics/
│   ├── curriculum-model.md
│   ├── correctness-validation.md
│   ├── deterministic-visuals.md
│   ├── quality-gates.md
│   └── workflow.md
├── schemas/
├── operations/
├── testing/
└── migration/
```

Adapt this structure to existing conventions instead of creating needless parallel documentation.

`MANIFEST.json` should contain at least:

- pack schema version;
- generator version;
- generation timestamp;
- repository revision;
- included pack files;
- mapped source files and hashes;
- exclusions;
- pack size;
- known limitations.

`source-index.json` should map major concepts and symbols to their current repository paths, including:

- CLI bootstrap;
- task registry;
- workflow engine;
- workflow state;
- artifact resolver;
- cache;
- batch runner;
- provider adapters;
- Dark Truth story bible;
- Dark Truth reference-image manifest;
- image, thumbnail, audio, caption, and render tasks;
- Mathematics curriculum and correctness validators;
- deterministic education renderer;
- metadata and publishing tasks;
- error taxonomy and observability.

Create or update deterministic commands equivalent to:

```bash
npm run ai-pack:build
npm run ai-pack:validate
npm run ai-pack:status
```

Use repository naming conventions if other commands already exist.

AI-pack validation must detect:

- stale source hashes;
- missing source files;
- obsolete links or symbols;
- missing required sections;
- duplicate pack entries;
- invalid manifests;
- binary or generated-media inclusion;
- excessive file sizes;
- secrets or credential-like values;
- contradictory command or architecture documentation.

Never include:

- `.env` values;
- API keys or tokens;
- credentials;
- private user data;
- generated audio, image, or video binaries;
- large base64 values;
- dependency directories;
- transient logs containing secrets.

Use redacted configuration examples.

# 26. Additional required deliverables

In addition to the earlier deliverables, create or adapt:

```text
docs/audits/repository-wide-duplicate-implementation-audit.md
docs/audits/repository-entrypoint-inventory.md
docs/audits/repository-ai-pack-audit.md

docs/architecture/target-repository-architecture.md
docs/architecture/ai-content-pack-design.md

docs/plans/repository-refactor-master-plan.md
docs/plans/repository-refactor-safe-batches.md
docs/plans/duplicate-elimination-plan.md
docs/plans/ai-content-pack-refresh-plan.md

docs/adr/ADR-ai-content-pack.md
```

Do not create redundant documents when an existing required document can be expanded cleanly. Record path adaptations.

# 27. Completion criteria

The task is complete only when:

1. the entire repository has been inspected;
2. every production capability has one canonical implementation;
3. all active entry points delegate to canonical implementations;
4. obsolete duplicate production logic has been removed or explicitly documented as a temporary adapter;
5. artifact paths are centrally resolved;
6. workflow state is canonical, resumable, auditable, and manually overridable;
7. task execution is idempotent and cache-aware;
8. batches resume at item level;
9. Dark Truth story-bible inputs and required reference images are enforced;
10. Mathematics correctness and curriculum gates are enforced;
11. existing episodes and legacy artifact layouts remain readable;
12. legacy commands work through adapters or provide actionable migration guidance;
13. deterministic repository validation passes, apart from separately documented pre-existing failures;
14. repository searches find no hidden duplicate production writers;
15. documentation matches the final source;
16. the AI content pack has been rebuilt;
17. the AI pack validates as current and contains no secrets or generated media binaries;
18. remaining technical debt is explicitly documented.

# 28. Safety constraints

- Preserve unrelated local changes.
- Do not execute paid provider requests.
- Do not publish content.
- Do not regenerate production media except deterministic test fixtures when necessary.
- Do not perform an unreviewable big-bang rewrite.
- Do not delete active implementations before caller migration and verification.
- Do not bulk-move existing episode artifacts without dry-run migration, compatibility reads, and rollback.
- Prefer strict TypeScript, discriminated unions, schema validation, dependency injection, and testable boundaries.
- Treat executable code and tests as stronger evidence than stale documentation.
- Do not claim duplicate elimination is complete without a final repository-wide verification pass.

# 29. Final response format

After all phases, respond with:

1. repository areas inspected;
2. baseline validation and pre-existing failures;
3. repository-wide duplicate inventory summary;
4. canonical implementations selected or created;
5. duplicate implementations removed;
6. compatibility adapters retained and their removal conditions;
7. final package and module boundaries;
8. final canonical CLI tree;
9. final workflow-state and event model;
10. cache, invalidation, batching, resume, and reconciliation behavior;
11. Dark Truth story-bible integration;
12. Dark Truth reference-image and visual-continuity integration;
13. Dark Truth content-quality gates;
14. Mathematics curriculum, correctness, visual, pedagogical, and accessibility gates;
15. source files created, modified, moved, or removed;
16. documentation created or updated;
17. tests added or changed;
18. final build, typecheck, lint, and test results;
19. AI content-pack path and structure;
20. AI-pack build, validation, and freshness commands;
21. AI-pack manifest summary and source coverage;
22. remaining technical debt and unresolved decisions;
23. anything that could not be fully verified;
24. confirmation that no paid provider requests or publishing operations were performed.
