# Codex Prompt — Task 14: Preview and Inspection CLI

## Model recommendation

- **Minimum:** GPT-5.4, medium reasoning
- **Recommended:** GPT-5.4, medium reasoning
- **Use GPT-5.5, high reasoning only if:** low-resolution preview rendering requires substantial renderer changes or existing CLI registration is unusually fragmented

## Task

Implement **Task 14: Preview And Inspection CLI** from:

`docs/plans/visual-retention-shot-architecture/tasks/14-preview-and-inspection-cli.md`

Work directly in the existing repository.

Do not enter planning mode. Implement the task now.

Assume Tasks 01–13 are complete and committed.

This task may run in parallel with Task 17 in a separate worktree. Keep changes isolated and minimize edits to shared CLI entry files.

---

## Objective

Add operator-facing CLI commands for planning, inspecting, validating, and previewing shot plans before full production rendering.

Register commands equivalent to:

```bash
pnpm mediaforge -- shots plan --episode <episode-id> --variant short --locale en
pnpm mediaforge -- shots inspect --episode <episode-id> --variant short --locale en
pnpm mediaforge -- shots validate --episode <episode-id> --variant short --locale en
pnpm mediaforge -- shots preview --episode <episode-id> --variant short --locale en
```

The commands must:

- use existing deterministic shot-planning, validation, rendering, and cache contracts;
- use resolver-owned artifact paths;
- avoid paid provider calls;
- produce stable machine-readable and human-readable output;
- allow operators to inspect quality before final rendering;
- preserve all existing CLI behavior.

---

## Source documents

Read only the relevant sections of:

```text
docs/plans/visual-retention-shot-architecture/tasks/14-preview-and-inspection-cli.md
docs/plans/visual-retention-shot-architecture/architecture-plan.md
docs/plans/visual-retention-shot-architecture/production-defaults.md
docs/plans/visual-retention-shot-architecture/validation-plan.md
```

Inspect completed implementations from Tasks 03, 07, 08, 12, and 13.

Likely relevant files include:

```text
apps/cli/src/index.ts
apps/cli/src/*
packages/visual-planning/src/*
packages/rendering/src/*
packages/shared/src/episode-filesystem.ts
```

Inspect only what is necessary.

---

## Scope boundary

Implement:

- `shots plan`;
- `shots inspect`;
- `shots validate`;
- `shots preview`;
- stable text and JSON reports;
- storyboard metadata;
- contact-sheet metadata or generation;
- low-resolution preview only when existing renderer support is ready;
- focused tests.

Do not implement:

- canonical pipeline integration;
- Dark Truth episode integration;
- legacy episode migration;
- rollout defaults;
- production telemetry;
- provider calls;
- new shot-planning rules;
- new validation policy;
- new renderer contracts;
- new cache semantics.

Do not redesign completed Tasks 07, 08, 12, or 13.

---

## Package and command organization

Prefer a dedicated command module such as:

```text
apps/cli/src/commands/shots.ts
```

and focused output helpers such as:

```text
apps/cli/src/shot-inspect-output.ts
apps/cli/src/shot-preview-output.ts
```

Keep edits to `apps/cli/src/index.ts` limited to command registration.

Do not duplicate path construction, planning logic, validation logic, or cache logic in CLI code.

---

## Shared command options

Use existing repository option conventions.

Support at minimum:

```text
--episode <episode-id>
--variant <short|full or existing canonical values>
--locale <locale>
```

Support existing config/workspace options when already required by other commands.

Add only necessary options such as:

```text
--profile <pacing-profile>
--format <text|json>
--force
--output <path>          # only if existing CLI conventions support explicit output paths
--resolution <preview profile>
```

Do not expose speculative internal knobs.

Validate all arguments using existing runtime schemas.

Reject:

- missing episode identity;
- invalid locale;
- invalid variant;
- unknown profile;
- unsafe explicit paths;
- conflicting flags.

Use resolver-owned defaults whenever no output path is supplied.

---

# Command: `shots plan`

## Behavior

The command must:

1. resolve the episode workspace;
2. load existing scene/source-image/focal metadata artifacts;
3. load pacing profile and visual budget;
4. invoke the completed deterministic shot planner;
5. persist the shot plan using the Task 03 resolver-owned path;
6. return a concise summary;
7. avoid rendering video;
8. avoid provider calls.

Use canonical paths such as:

```text
state/visual-retention/shot-plan.<variant>.<locale>.json
```

through shared resolver helpers rather than manual path construction.

## Rules

- equivalent inputs must produce byte-stable plans;
- do not regenerate source images;
- do not retime narration;
- do not mutate existing scene plans;
- use `--force` only to bypass existing reusable output when existing CLI conventions support it;
- report whether the plan was created, reused, or replaced;
- do not silently overwrite malformed existing artifacts without reporting it.

---

# Command: `shots inspect`

## Behavior

Load an existing shot plan and related artifacts, then print an inspection report.

Support:

```text
--format text
--format json
```

JSON output must be stable and suitable for scripts.

Text output must be concise and readable.

## Required report fields

Include at minimum:

- generated source-image count;
- total rendered-shot count;
- average shot duration;
- median shot duration;
- longest shot;
- longest fully static interval;
- meaningful visual changes in the first eight seconds;
- opening change intervals;
- climax average shot duration;
- climax change intervals;
- average shots per source image;
- maximum consecutive source-image reuse;
- maximum total uses for one source image;
- treatment distribution;
- transition distribution;
- source-image usage distribution;
- validation warning count;
- validation error count;
- validation status;
- estimated avoided image-generation calls;
- estimated image-generation savings when cost inputs exist;
- estimated local render work or clip count;
- derived-clip cache hit/miss information when an existing cache report exists.

Do not claim exact financial savings when only estimates are available.

Label estimated values clearly.

Do not print full narration, prompts, secrets, or large manifests.

---

# Command: `shots validate`

## Behavior

The command must:

1. load the shot plan and required dependencies;
2. invoke the completed Task 08 validator;
3. persist the validation result to the Task 03 validation-report path;
4. print a stable report;
5. return an appropriate process exit code.

Suggested exit behavior:

- exit `0` when validation has no errors;
- exit non-zero when validation contains errors;
- warnings alone do not fail the command unless an existing strict mode explicitly requests it.

Use existing CLI exit-code conventions if they differ.

## Output

Include:

- valid/pass status;
- issue count by severity;
- issue code;
- owning shot ID;
- owning scene ID;
- concise message;
- repair suggestion where available;
- relevant metric values.

Do not rerun or duplicate validation rules in CLI code.

---

# Command: `shots preview`

## Behavior

Create review artifacts before full rendering.

The minimum acceptable implementation must generate storyboard/contact-sheet review data.

Preferred artifacts:

```text
state/visual-retention/storyboard.<variant>.<locale>.html
state/visual-retention/contact-sheet.<variant>.<locale>.png
```

through resolver helpers.

Each storyboard entry should show or reference:

- shot timestamp;
- shot duration;
- source image;
- source scene;
- crop rectangle;
- motion direction;
- treatment;
- transition;
- narration excerpt;
- caption excerpt;
- evidence insert summary;
- validation warnings.

Keep excerpts short and avoid embedding complete narration.

## Storyboard HTML

If generating HTML:

- generate deterministic local HTML;
- do not load remote JavaScript, CSS, fonts, or images;
- escape all content;
- use relative local asset references where safe;
- do not allow script injection;
- make the file usable offline;
- keep CSS simple and embedded;
- avoid a new frontend framework.

## Contact sheet

If contact-sheet generation is supported with existing local image tooling:

- use existing Sharp or image utilities;
- do not add a heavyweight dependency;
- include shot number, timestamp, and concise treatment label;
- show the planned crop where practical;
- preserve deterministic ordering;
- use a bounded preview resolution;
- do not alter source images.

If final contact-sheet rendering cannot be implemented without broad scope expansion, persist complete deterministic metadata and produce the storyboard HTML. Report the contact-sheet limitation explicitly.

## Low-resolution preview video

Implement only when Task 12 already exposes a clean preview-capable render path.

Requirements:

- use the same filter builders as final rendering;
- use lower resolution and/or controlled FPS through an explicit preview profile;
- preserve timing and treatment semantics;
- use derived-clip caching only through existing Task 13 APIs;
- do not create a separate visual implementation;
- do not call paid providers.

Do not modify renderer contracts merely to force preview support into Task 14.

---

## Artifact reuse

For each command:

- detect existing valid artifacts through current parsing and fingerprint rules;
- reuse them when safe;
- report reuse;
- do not trust file existence alone where manifests or fingerprints exist;
- avoid unnecessary renderer invocation;
- avoid unnecessary shot-plan regeneration.

Do not implement new fingerprint logic.

---

## Error handling

Use existing typed errors and CLI formatting conventions.

Produce actionable errors for:

- missing scene plan;
- missing image manifest;
- missing source image;
- missing focal metadata where required;
- malformed shot plan;
- incompatible validation artifact;
- preview render failure;
- unsafe output path.

Do not dump large internal objects or full FFmpeg stderr by default.

Do not expose secrets or narration.

---

## Determinism

Equivalent local artifacts and options must produce:

- byte-stable JSON reports;
- stable text ordering;
- stable issue ordering;
- stable storyboard shot ordering;
- stable artifact filenames.

Do not include current timestamps in deterministic content unless existing report conventions require operational metadata. Exclude such values from fingerprints.

---

## Tests

Add focused tests, preferably:

```text
apps/cli/src/shot-commands.unit.test.ts
apps/cli/src/shot-inspect-output.unit.test.ts
apps/cli/src/shot-preview-output.unit.test.ts
```

Run at minimum:

```bash
pnpm test:focused -- apps/cli/src/index.unit.test.ts
pnpm test:focused -- apps/cli/src/shot-inspect-output.unit.test.ts
```

Also run applicable existing tests:

```bash
pnpm test:focused -- packages/visual-planning/src/shot-planner.unit.test.ts
pnpm test:focused -- packages/visual-planning/src/shot-validation.unit.test.ts
pnpm test:focused -- packages/rendering/src/index.unit.test.ts
pnpm test:focused -- packages/rendering/src/derived-shot-cache.unit.test.ts
pnpm test:focused -- packages/shared/src/episode-filesystem.unit.test.ts
```

Use the closest existing filenames where names differ.

## Required test coverage

### Command registration

- all four commands are registered;
- existing commands remain registered;
- help output is stable;
- invalid options fail predictably.

### Plan

- planner is called with resolved artifacts;
- shot plan is persisted to the resolver-owned path;
- no provider call occurs;
- no render occurs;
- existing valid plan can be reused;
- malformed input fails clearly.

### Inspect

- stable text output;
- stable JSON output;
- duration statistics;
- opening-change metrics;
- climax metrics;
- source-image reuse metrics;
- treatment and transition distributions;
- estimated savings clearly marked as estimated;
- no narration or secrets printed.

### Validate

- valid plan exits successfully;
- plan with errors exits non-zero;
- warnings-only plan succeeds;
- validation artifact is persisted;
- issue ordering is deterministic.

### Preview

- storyboard path is resolver-owned;
- contact-sheet path is resolver-owned;
- shot ordering follows timeline;
- HTML content is escaped;
- no remote dependencies;
- no provider call;
- low-resolution preview uses existing renderer path when enabled;
- preview failure does not corrupt an existing valid artifact.

### Compatibility

- current CLI tests pass;
- existing commands behave unchanged;
- no pipeline integration is required;
- no legacy migration behavior is introduced.

Avoid large snapshots. Assert semantic output and concise stable fragments.

---

## Type safety and security

- do not use `any`;
- avoid unchecked assertions;
- keep output DTOs readonly;
- use exhaustive switches for output formats;
- escape HTML;
- reject unsafe explicit paths;
- do not execute shell commands;
- do not embed untrusted content in HTML without escaping;
- do not expose full local filesystem paths in normal reports unless existing CLI behavior does so.

---

## Performance

Inspection and validation should not decode or render media unnecessarily.

Reuse persisted metrics and manifests when valid.

Do not:

- hash all videos repeatedly when cache manifests already prove identity;
- decode full-size images for text-only inspection;
- invoke FFmpeg for `plan`, `inspect`, or `validate`;
- scan unrelated episode directories.

---

## Compatibility review

Before finishing, confirm:

- existing CLI behavior is unchanged;
- planning and validation require no paid APIs;
- all paths come from the shared resolver;
- preview and final rendering use the same filter-builder semantics where preview video is implemented;
- no canonical pipeline or Dark Truth integration was added;
- no legacy migration behavior was added;
- no production telemetry was added.

---

## Execution procedure

1. Inspect existing CLI registration and output conventions.
2. Implement a dedicated `shots` command module.
3. Implement `plan`.
4. Implement reusable inspection DTOs and formatters.
5. Implement `inspect`.
6. Implement `validate`.
7. Implement storyboard/contact-sheet preview artifacts.
8. Add low-resolution preview only if existing renderer support makes it narrow and safe.
9. Add focused tests.
10. Run affected type checks.
11. Run:

```bash
git diff --check
```

12. Review for accidental Task 15, 16, 17, or 18 work.
13. Create exactly one commit.

---

## Commit

Use:

```text
feat(cli): add shot planning and preview commands
```

Do not proceed to Task 15, 16, 17, or 18.

---

## Final response

Return only:

- concise summary;
- files changed;
- commands added;
- report fields added;
- preview artifacts implemented;
- reuse behavior;
- tests and type checks with results;
- commit hash;
- any preview limitation deferred to later work.

Do not produce another architecture plan.
