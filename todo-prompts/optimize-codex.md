# Create a Root-Level AGENTS.md for Token-Efficient Codex Work

Create a new root-level file:

```text
AGENTS.md
```

The repository does not currently have an `AGENTS.md`.

The purpose of this file is to define concise default rules that reduce Codex token consumption during implementation tasks while preserving correctness, security, and maintainability.

Do not perform a repository-wide architecture analysis. Inspect only enough of the repository to identify:

- the repository root;
- package-manager and monorepo conventions;
- relevant generated or artifact directories;
- directories containing persisted OpenAI request or response payloads;
- existing ignore configuration such as `.gitignore`, `.ignore`, or `.rgignore`.

Create `AGENTS.md` with the following content, adapting path names only when the repository clearly uses different equivalents.

```md
# Codex Repository Instructions

## General execution

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

## Excluded paths

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

## Progress updates

- Keep progress updates concise.
- Report only meaningful findings, decisions, blockers, and validation failures.
- Do not narrate routine file reads, searches, edits, or commands.
- Do not repeat information already provided.
- Do not provide a lengthy plan unless planning was explicitly requested.

## Implementation output

Unless explicitly requested:

- Do not paste complete modified files.
- Do not paste large diffs.
- Do not explain obvious code.
- Do not provide a detailed implementation walkthrough.
- Do not provide a complete diff walkthrough.
- Do not automatically generate:
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

## Validation strategy

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

## Repair-loop limits

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

## Command-output control

- Use concise test reporters where supported.
- Avoid reading or returning unnecessarily large command output.
- Focus on the relevant error section when output is extensive.
- Do not repeat identical stack traces or logs.
- Prefer targeted filtering over reading complete large log files.
- Never omit information required to diagnose correctness, security, or data-loss risks.

## Precedence

These are default efficiency rules.

Explicit task requirements override them.

Correctness, security, prevention of data loss, and explicitly requested validation or documentation take priority over token reduction.
```

## Repository-specific exclusions

Search briefly for directories that persist OpenAI prompts, requests, responses, traces, or provider logs.

Examples may include names such as:

```text
requests/
responses/
prompts/
openai/
provider-payloads/
api-traces/
debug-payloads/
```

Only add directories that actually exist and clearly contain large generated payloads.

Add those paths to the `Excluded paths` section in `AGENTS.md`.

Do not exclude:

- source code;
- configuration;
- schemas;
- small fixtures;
- tests;
- documentation required to understand the implementation.

## Optional search exclusions

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

Add any confirmed persisted OpenAI payload directories.

Do not add `.git/` to `.rgignore`; ripgrep already ignores it normally.

Do not modify `.gitignore` merely to prevent Codex from inspecting tracked files.

Do not change runtime configuration.

## Keep the file concise

The `AGENTS.md` file itself contributes to context consumption.

Therefore:

- keep it focused on durable repository-wide rules;
- avoid architecture documentation;
- avoid long explanations;
- avoid repository history;
- avoid examples beyond those required to prevent ambiguity;
- remove duplicate or overlapping rules.

## Validation

After creating the files:

1. verify that `AGENTS.md` is located at the repository root;
2. verify the Markdown structure;
3. verify exclusion paths against the actual repository;
4. verify that no source or required fixture directory was accidentally excluded;
5. inspect the final diff for duplicates and contradictions.

Do not run the application build, test suite, linting, or type-checking for this documentation-only change.

## Completion response

Return only:

- files created or changed;
- repository-specific exclusion paths added;
- validation performed;
- unresolved limitations.

Do not provide an audit, architecture explanation, task list, migration guide, changelog, commit message, or pull request description.
