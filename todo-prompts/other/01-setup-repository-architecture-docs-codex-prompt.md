# Create Concise Repository Architecture Documentation

Analyze this repository and create a concise, maintainable documentation system that helps future Codex sessions understand the codebase without repeatedly performing broad repository scans.

This task is documentation-only. Do not refactor application code or change runtime behavior.

## Objective

Create focused repository documentation under `docs/` and link it from the root-level `AGENTS.md`.

The documentation must:

- describe stable architecture and development conventions;
- help Codex locate relevant code quickly;
- reduce repeated repository discovery;
- remain concise enough that reading it does not itself cause excessive token usage;
- direct Codex to read only documents relevant to the current task.

Do not attempt to document every file, class, function, dependency, or implementation detail.

## Discovery scope

Inspect the repository sufficiently to identify:

- applications and packages;
- principal entry points;
- package and service boundaries;
- major pipeline stages;
- configuration ownership;
- important interfaces and public contracts;
- persistence and external provider boundaries;
- test, build, lint, and type-check commands;
- generated and artifact directories;
- retry, error-handling, and idempotency behavior;
- important architecture decisions already represented by the code.

Do not inspect generated or large artifact directories unless required:

- `node_modules/`
- `dist/`
- `coverage/`
- `.git/`
- `episodes/**/output/`
- `episodes/**/state/`
- `episodes/**/generated-assets/`
- `audio/`
- `video/`
- `images/`
- `transcripts/`
- `logs/`
- persisted OpenAI request and response payloads.

Use targeted searches and inspect representative entry points rather than reading every file.

## Root `AGENTS.md`

The repository does not currently have an `AGENTS.md`.

Create a concise root-level `AGENTS.md` containing:

- durable repository-wide execution rules;
- token-efficient inspection rules;
- generated and artifact path exclusions;
- concise progress and completion-output rules;
- targeted validation rules;
- a two-attempt repair-loop limit;
- a short documentation index linking to the relevant files under `docs/`.

Do not place complete architecture documentation inside `AGENTS.md`.

The file itself contributes to context usage, so keep it compact and avoid duplicate or explanatory prose.

Include these execution rules:

### Scope and inspection

- Make the smallest coherent change that satisfies the task.
- Inspect only files and directories relevant to the current task.
- Start with files explicitly named in the task.
- Read additional files only when required for imports, types, configuration, tests, or directly related behavior.
- Do not perform repository-wide analysis unless explicitly requested.
- Do not scan unrelated packages or services.
- Prefer targeted searches using symbols, filenames, imports, and exact error messages.
- Do not repeatedly inspect unchanged files.
- Do not refactor or reformat unrelated code.
- Do not add dependencies unless required.
- Reuse existing abstractions and conventions where reasonable.
- Report adjacent issues briefly instead of implementing them unless they block the task.

### Excluded paths

Do not inspect, search, or read these paths unless the task explicitly requires them:

- `node_modules/`
- `dist/`
- `coverage/`
- `.git/`
- `episodes/**/output/`
- `episodes/**/state/`
- `episodes/**/generated-assets/`
- `audio/`
- `video/`
- `images/`
- `transcripts/`
- `logs/`

Also avoid persisted OpenAI request and response payloads, including:

- complete request bodies;
- complete response bodies;
- generated prompt archives;
- model debug payloads;
- provider trace dumps;
- large API response logs.

Small source-code fixtures and test fixtures containing mocked provider data are not excluded.

### Progress updates

- Keep progress updates concise.
- Report only meaningful findings, decisions, blockers, and validation failures.
- Do not narrate routine file reads, searches, edits, or commands.
- Do not repeat information already provided.
- Do not provide a lengthy plan unless planning was explicitly requested.

### Completion output

Unless explicitly requested:

- do not paste complete modified files;
- do not paste large diffs;
- do not explain obvious code;
- do not provide a detailed implementation walkthrough;
- do not provide a complete diff walkthrough;
- do not automatically generate:
  - a detailed audit;
  - an architecture explanation;
  - a task list;
  - a migration guide;
  - a changelog;
  - a commit message;
  - a pull request title or description.

The final response should contain only:

- changed files;
- implemented behavior;
- validation performed and results;
- unresolved blockers or important limitations.

Keep the final response concise.

### Validation strategy

Run the narrowest relevant validation first.

Prefer, in order:

1. directly affected tests;
2. tests for the modified package or module;
3. type-checking for the affected package;
4. linting for modified files or the affected package.

By default:

- do not run the root build;
- do not run the complete test suite;
- do not run the complete monorepo build;
- do not run all-package linting;
- do not run all-package type-checking.

Run broader validation only when:

- explicitly requested;
- required by another repository instruction;
- the change affects shared infrastructure or public contracts;
- targeted validation cannot establish correctness;
- a targeted failure indicates a broader compatibility problem.

When broader validation is necessary, state the reason in one concise sentence.

### Repair-loop limits

- After a validation failure, inspect the relevant error and attempt a focused repair.
- Stop after two unsuccessful repair attempts for the same underlying failure.
- Do not repeatedly apply speculative fixes.
- After two unsuccessful attempts:
  - stop modifying code for that failure;
  - preserve the best valid state;
  - report the exact remaining failure;
  - briefly summarize the attempted fixes;
  - identify the likely cause or required next investigation.

A repair attempt counts when code or configuration is changed and the relevant validation is rerun.

Correcting a command typo, missing executable, environment issue, or transient infrastructure failure does not count as a code-repair attempt.

Never weaken tests, remove assertions, suppress type errors, disable lint rules, or reduce validation strictness merely to make a check pass.

### Command-output control

- Use concise test reporters where supported.
- Avoid reading or returning unnecessarily large command output.
- Focus on the relevant error section when output is extensive.
- Do not repeat identical stack traces or logs.
- Prefer targeted filtering over reading complete large log files.
- Never omit information required to diagnose correctness, security, or data-loss risks.

### Precedence

These are default efficiency rules.

Explicit task requirements override them.

Correctness, security, prevention of data loss, and explicitly requested validation or documentation take priority over token reduction.

## Documentation structure

Create only documents justified by the repository.

Prefer this structure:

```text
docs/
├── README.md
├── architecture/
│   ├── system-overview.md
│   ├── story-rewrite-pipeline.md
│   ├── localization-pipeline.md
│   └── data-flow.md
├── development/
│   ├── commands.md
│   ├── testing.md
│   ├── configuration.md
│   └── error-handling.md
└── decisions/
    └── README.md
```

Adapt filenames to the actual repository.

Do not create empty placeholder documents.

Do not create a single large repository-analysis document.

## Documentation requirements

### `docs/README.md`

Create a short index containing:

- each document;
- its purpose;
- when Codex should read it;
- which subsystem it covers.

State clearly:

> Read only the documents relevant to the current task. Do not load the complete documentation set by default.

### System overview

Document:

- repository type and package-manager conventions;
- applications and packages;
- ownership boundaries;
- major runtime components;
- primary execution flow;
- external systems;
- where configuration, tests, and generated artifacts live.

Keep this as an overview, not a file inventory.

### Pipeline documents

For each important pipeline, document:

- purpose;
- entry point;
- ordered stages;
- inputs and outputs;
- primary services and interfaces;
- configuration;
- persistence;
- retry and failure behavior;
- relevant tests;
- source locations.

Use diagrams only when they communicate the flow more concisely than prose. Prefer Mermaid when a diagram is justified.

### Development commands

Document exact, verified commands for:

- running the relevant application or CLI;
- package-level tests;
- targeted tests;
- package-level type checking;
- package-level linting;
- builds that are genuinely required.

Do not recommend root-level validation when a narrower command exists.

### Configuration

Document:

- configuration sources;
- environment-variable groups;
- which module owns each group;
- precedence and defaults;
- secrets versus non-secret configuration.

Do not copy secret values or complete environment files.

### Error handling

Document:

- error categories;
- retryable versus terminal failures;
- truncation and token-exhaustion handling;
- validation failures;
- logging and observability behavior;
- idempotency and resume behavior where applicable.

### Architecture decisions

If important architectural decisions can be inferred reliably, create a concise decision index.

Do not invent historical rationale.

Clearly distinguish:

- facts visible in the repository;
- reasonable architectural inference;
- unresolved questions.

## Source references

Every architecture document should reference relevant source paths.

Use focused references such as:

```text
- CLI entry point: `apps/cli/src/index.ts`
- Story rewrite service: `packages/story/src/...`
- Configuration schema: `packages/config/src/...`
```

Do not list every file in a directory.

Do not paste large code excerpts.

## Update `AGENTS.md`

Add a concise documentation index to the root `AGENTS.md`.

The index must:

- link to `docs/README.md`;
- link directly to the highest-value architecture documents;
- explain when each document should be read;
- tell Codex not to load all documents by default;
- state that source code takes precedence when documentation conflicts with implementation;
- require updating documentation only when a task changes documented architecture or behavior.

Suggested wording:

```md
## Repository documentation

Read only documentation relevant to the current task.

Start with `docs/README.md` when repository context is required. Do not read the
complete documentation set by default.

Source code is authoritative when it conflicts with documentation. When the
current task changes documented behavior or architecture, update only the
affected document.
```

Add direct links for the most important subsystem documents discovered.

Keep the entire documentation section in `AGENTS.md` under 40 lines.

## Accuracy safeguards

- Do not guess undocumented behavior.
- Mark uncertain conclusions as unresolved.
- Verify commands against package scripts and repository configuration.
- Verify paths before documenting them.
- Prefer actual implementation over comments or outdated documentation.
- Do not represent planned functionality as implemented.
- Do not document generated outputs as source architecture.
- Do not expose credentials, tokens, personal data, or complete provider payloads.

## Search exclusions

Check for `.rgignore`.

If `.rgignore` already exists, add appropriate generated and artifact paths without duplicating rules.

If it does not exist, create it only when the repository commonly uses `rg` or ripgrep-based searches.

Suggested entries:

```gitignore
node_modules/
dist/
coverage/
episodes/**/output/
episodes/**/state/
episodes/**/generated-assets/
audio/
video/
images/
transcripts/
logs/
```

Add any confirmed directories containing persisted OpenAI request or response payloads.

Do not add `.git/` to `.rgignore`; ripgrep already ignores it normally.

Do not modify `.gitignore` merely to prevent Codex from inspecting tracked files.

Do not change runtime configuration.

## Size constraints

Keep documentation concise:

- `docs/README.md`: preferably under 120 lines;
- system overview: preferably under 250 lines;
- subsystem documents: preferably under 250 lines each;
- development documents: preferably under 180 lines each;
- `AGENTS.md`: concise and focused;
- `AGENTS.md` documentation index: preferably under 40 lines.

Exceed these limits only when necessary for correctness.

Avoid duplicated information. Link to one canonical document instead.

## Validation

After creating the documentation:

1. verify every referenced path exists;
2. verify documented commands against package scripts;
3. verify links between Markdown files;
4. verify there is no duplicated architecture description;
5. verify uncertain findings are clearly marked;
6. verify `AGENTS.md` does not instruct Codex to read every document;
7. verify no source or required fixture directory was accidentally excluded;
8. verify no application code or runtime configuration was changed;
9. inspect the final diff for duplicate or contradictory rules.

Do not run the root build, complete test suite, linting, or type-checking for this documentation-only task.

## Completion response

Return only:

- files created or changed;
- architecture areas documented;
- repository-specific exclusion paths added;
- unresolved questions or uncertain findings;
- validation performed.

Do not provide a detailed walkthrough, full repository audit, task list, migration guide, changelog, commit message, or pull request description.
