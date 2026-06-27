You are working in an existing production-grade TypeScript/Node.js YouTube horror-story generation repository.

Extend the existing full-story and short-story rewrite functionality so both workflows can accept an arbitrary English Markdown story file from the command line together with a target episode slug and use that input to create and initialize a new episode.

Implement this directly on the currently checked-out branch.

Do not create or switch branches. Do not commit, push, merge, rebase, reset, stash, or discard unrelated changes.

This task extends the existing rewrite utilities. Do not build a separate duplicate rewrite pipeline.

## Primary objective

Extend the existing commands conceptually equivalent to:

```bash
pnpm cli stories rewrite-full
pnpm cli stories rewrite-short
```

so they support a new-episode creation mode:

```bash
pnpm cli stories rewrite-full \
  --input ./imports/the-christmas-doll.md \
  --episode-slug the-christmas-doll \
  --languages en,de,es,fr,pt
```

```bash
pnpm cli stories rewrite-short \
  --input ./imports/the-christmas-doll.md \
  --episode-slug the-christmas-doll \
  --languages en,de,es,fr,pt
```

When the target episode does not exist, the command must:

1. validate and parse the external Markdown file;
2. allocate or resolve an episode number according to repository conventions;
3. create the canonical episode directory;
4. copy or normalize the original English source into the canonical source location;
5. initialize the episode manifest and required metadata;
6. run the existing full-story or short-story rewrite pipeline;
7. generate requested localized outputs;
8. persist all generated assets and metadata under the new episode;
9. leave the external input file unchanged;
10. ensure the created episode is immediately usable by downstream audio, image, video, metadata, and upload commands.

When the target episode already exists, the command must not silently create duplicate episode state or overwrite its source.

## Required behavior

Support two distinct modes:

### Existing-episode mode

The command resolves an already existing episode:

```bash
pnpm cli stories rewrite-full \
  --episode 009 \
  --languages en,de
```

```bash
pnpm cli stories rewrite-short \
  --episode 009 \
  --languages en,de
```

This behavior must remain backward-compatible.

### New-episode mode

The command accepts an external Markdown input and a target episode slug:

```bash
pnpm cli stories rewrite-full \
  --input ./incoming/story.md \
  --episode-slug the-christmas-doll \
  --languages en,de,es
```

```bash
pnpm cli stories rewrite-short \
  --input ./incoming/story.md \
  --episode-slug the-christmas-doll \
  --languages en,de,es
```

The target slug identifies the new canonical episode.

The source Markdown file may be outside the repository.

## Repository safety

Before implementation:

1. inspect the current branch and working-tree status;
2. preserve all unrelated modifications;
3. inspect the existing full and short rewrite implementations;
4. inspect episode initialization and discovery logic;
5. inspect manifest schemas and path conventions;
6. reuse existing helpers rather than duplicating them;
7. implement the feature immediately after analysis;
8. do not stop after writing a plan.

At completion, report:

- implementation summary;
- changed and added files;
- CLI syntax;
- validation commands;
- test results;
- assumptions;
- remaining limitations;
- any pre-existing unrelated failures.

## CLI interface

Extend both rewrite commands with:

```text
--input <markdown-path>
--episode-slug <slug>
--episode-number <number>
--title <title>
--create-episode
--source-mode <copy|normalize>
```

Use existing option naming when the repository already has established equivalents.

### Recommended examples

Create an episode and generate optimized full stories:

```bash
pnpm cli stories rewrite-full \
  --input ./incoming/009-the-christmas-doll-en-full.md \
  --episode-slug the-christmas-doll \
  --languages en,de,es,fr,pt
```

Create an episode and generate Shorts:

```bash
pnpm cli stories rewrite-short \
  --input ./incoming/009-the-christmas-doll-en-full.md \
  --episode-slug the-christmas-doll \
  --languages en,de,es,fr,pt
```

Explicitly select an episode number:

```bash
pnpm cli stories rewrite-full \
  --input ./incoming/story.md \
  --episode-number 109 \
  --episode-slug the-last-elevator \
  --languages en,de
```

Preview creation without writing or calling OpenAI:

```bash
pnpm cli stories rewrite-full \
  --input ./incoming/story.md \
  --episode-slug the-last-elevator \
  --languages en,de \
  --dry-run
```

## Option semantics

### `--input`

An external or repository-local English Markdown source file.

Requirements:

- must exist;
- must be a regular file;
- must be readable;
- must use a supported text encoding;
- must have a `.md` or `.markdown` extension unless the repository intentionally supports plain text;
- must not be empty;
- must contain usable story narration;
- must represent a full English source story;
- must not be an already generated Short;
- must remain unchanged.

### `--episode-slug`

The desired stable episode slug.

Examples:

```text
the-christmas-doll
the-last-elevator
the-book-that-finishes-itself
```

Normalize and validate it.

Canonical rules should be centralized:

- lowercase ASCII;
- words separated by a single hyphen;
- no leading or trailing hyphens;
- no repeated hyphens;
- no slashes;
- no dots or `..`;
- no shell metacharacters;
- no path separators;
- no empty slug;
- sensible maximum length;
- reject reserved directory names when relevant.

Do not silently transform a materially invalid slug into a different identifier. Normalization may trim, lowercase, collapse whitespace, and replace safe separators, but report the final canonical slug during dry-run and normal execution.

### `--episode-number`

Optional explicit number.

When supplied:

- validate it as a positive integer;
- apply repository padding conventions;
- reject a number already used by another episode;
- reject conflicts between number, slug, directory, and manifest;
- use it consistently in filenames and metadata.

When omitted:

- allocate the next available episode number using repository conventions;
- do not assume `highest + 1` is always safe without checking manifests and directories;
- prevent duplicate allocation within the running process;
- use a filesystem-safe locking or reservation strategy if concurrent CLI processes could create episodes;
- fail safely when atomic allocation cannot be guaranteed.

### `--title`

Optional source episode title.

Resolution priority:

1. explicit `--title`;
2. title extracted from the Markdown heading or metadata;
3. humanized episode slug.

Do not use an unvalidated filename as the final title.

### `--create-episode`

This may be explicit or automatically inferred when both `--input` and `--episode-slug` are supplied and no matching episode exists.

Document the chosen behavior.

Prefer automatic inference for usability, while retaining the flag if it improves safety or clarity.

### `--source-mode`

Support:

```text
copy
normalize
```

`copy`:

- preserve the supplied Markdown content byte-for-byte where possible;
- copy it into the canonical source location;
- do not rewrite the source;
- calculate hashes for both external and canonical files.

`normalize`:

- parse the supplied Markdown;
- write a canonical source Markdown file using repository formatting;
- preserve the narration text and source-supported production instructions;
- do not optimize or localize the canonical source during import;
- store the original external source hash;
- store normalization metadata.

Default to the safest behavior compatible with the existing pipeline. Prefer `copy` unless downstream parsing requires canonical normalization.

## Argument compatibility

Define clear valid combinations.

### Valid existing-episode mode

```text
--episode
```

Optionally with:

```text
--languages
--resume
--overwrite
--dry-run
```

### Valid new-episode mode

```text
--input + --episode-slug
```

Optionally with:

```text
--episode-number
--title
--source-mode
--languages
--resume
--overwrite
--dry-run
```

### Invalid combinations

Reject clearly:

```text
--episode + --episode-slug
```

when they identify different episodes.

Reject:

```text
--episode-number
```

without new-episode mode unless the existing CLI already uses it for lookup.

Reject an external `--input` that would cause the source and destination paths to be identical and then be overwritten.

Reject incompatible options such as:

```text
--resume + --overwrite
```

unless the repository has an explicit documented precedence rule.

Do not guess when arguments identify conflicting episode numbers, slugs, paths, or manifests.

## Shared episode bootstrap service

Do not place episode creation logic directly inside both CLI handlers.

Create or reuse a shared typed service conceptually equivalent to:

```ts
interface BootstrapEpisodeFromMarkdownInput {
  inputPath: string;
  episodeSlug: string;
  episodeNumber?: number;
  title?: string;
  sourceMode: "copy" | "normalize";
  dryRun: boolean;
}

interface BootstrapEpisodeResult {
  mode: "existing" | "created" | "planned";
  episodeId: string;
  episodeNumber: number;
  episodeSlug: string;
  episodeTitle: string;
  episodeDirectory: string;
  canonicalSourcePath: string;
  sourceSha256: string;
  canonicalSourceSha256?: string;
  manifestPath: string;
  createdPaths: string[];
}
```

Use the repository’s actual types and architecture.

Both full and short rewrite commands must call the same episode bootstrap service.

Do not duplicate:

- slug validation;
- episode-number allocation;
- source parsing;
- path construction;
- manifest initialization;
- collision checks;
- atomic directory creation;
- source copying;
- dry-run planning.

## Transactional episode creation

Episode bootstrapping must behave transactionally.

Do not leave a half-created episode when validation or filesystem operations fail.

Recommended sequence:

1. resolve and validate the external source;
2. parse source metadata and narration;
3. validate slug;
4. resolve or allocate episode number;
5. calculate all canonical target paths;
6. check all collisions;
7. generate the initial manifest entirely in memory;
8. create a temporary staging directory under the same filesystem;
9. write or copy the source into staging;
10. write the initial manifest into staging;
11. validate the staged episode;
12. atomically rename staging to the final episode directory;
13. run the requested rewrite pipeline;
14. update manifest artifacts after each validated generation.

If atomic directory rename is not suitable for the existing layout, implement explicit rollback for newly created paths.

Never delete or roll back an episode directory that existed before the command started.

## Existing episode collision handling

Before creating an episode, check:

- canonical episode directory;
- episode manifests;
- global episode index;
- episode number usage;
- episode slug usage;
- generated story indexes;
- source filenames;
- aliases or archived episodes if applicable.

Possible cases:

### Neither number nor slug exists

Create the episode.

### Slug exists and number matches

Treat it as an existing episode only when its manifest and source are valid.

Require an explicit option if importing a new source into it would replace or conflict with the canonical source.

### Slug exists with another number

Fail with an actionable conflict.

### Number exists with another slug

Fail with an actionable conflict.

### Directory exists without a valid manifest

Treat this as incomplete or corrupted state.

Do not silently adopt it.

Return an error explaining which files exist and which expected files are missing.

### Manifest exists but directory is missing

Treat this as inconsistent state and fail.

Do not create another episode using the same identity.

## Import into an existing episode

By default, external input plus `--episode-slug` is intended to create a new episode.

Do not overwrite an existing canonical source.

When an episode already exists:

- if its canonical source hash matches the supplied input, safely reuse it;
- if hashes differ, fail by default;
- require a specific explicit option such as:

```text
--replace-source
```

only if the repository should support source replacement.

Do not add `--replace-source` unless it can be implemented safely.

If implemented:

- require `--overwrite` as well;
- back up or version the previous source according to repository conventions;
- mark all generated artifacts stale;
- preserve manifest history;
- never replace the source before the new source is validated.

## Input Markdown format

Support Markdown similar to:

```md
# Episode 009 — The Christmas Doll Opened Her Eyes

## Audio Generation Instructions

> Production directions only. Do not narrate headings, Markdown, metadata, or sound-effect labels.

- Use one consistent adult male narrator.
- Speak in natural English with a restrained dark-documentary tone.
- Target approximately 145–160 words per minute.

### Episode-specific sound motif

Use music box, winter wind, and porcelain tapping.

# Narration Script

The doll arrived without a sender.

It was waiting on the doorstep when Lily came home...
```

The importer must also tolerate reasonable variants:

- `# Narration Script`;
- `## Narration Script`;
- `# Story`;
- `## Story`;
- front matter followed by narration;
- no audio instructions;
- a single H1 title followed directly by narration;
- plain narrative paragraphs with no section heading.

Do not use broad heuristics that accidentally import metadata or instructions as spoken narration.

## Markdown parser

Create or extend a shared parser returning a strict structure conceptually equivalent to:

```ts
interface ParsedStoryMarkdown {
  sourceTitle?: string;
  sourceEpisodeNumber?: number;
  sourceEpisodeSlug?: string;
  narration: string;
  audioInstructions?: string;
  soundMotif?: string;
  frontMatter?: Record<string, unknown>;
  warnings: StoryImportWarning[];
}
```

Use a real Markdown parser already installed where practical.

Do not parse complex Markdown solely using one large regular expression.

The parser should distinguish:

- title;
- production instructions;
- narration;
- sound motif;
- metadata;
- Markdown comments;
- fenced code;
- blockquotes;
- hidden instructions.

Validate narration independently from all non-spoken sections.

## Source title and number conflicts

The input Markdown may contain an episode number or title different from command-line values.

Use these rules:

### Episode number

`--episode-number` is authoritative.

If the Markdown contains a different number:

- do not silently adopt it;
- report a warning or fail according to strictness;
- store the original source number in import metadata;
- use the requested target episode number in canonical paths and generated outputs.

When no `--episode-number` is supplied:

- do not automatically use the source number unless it is available and unoccupied and repository policy allows it;
- otherwise allocate the next valid number;
- document the decision.

### Episode slug

`--episode-slug` is authoritative.

A slug derived from the Markdown title or input filename is only advisory.

### Title

`--title` is authoritative.

Otherwise use the parsed Markdown title.

If absent, humanize the target slug.

## Canonical episode identity

Centralize episode identity construction.

Conceptual result:

```ts
interface EpisodeIdentity {
  number: number;
  id: string;
  paddedNumber: string;
  slug: string;
  title: string;
  directoryName: string;
}
```

Example:

```json
{
  "number": 109,
  "id": "109",
  "paddedNumber": "109",
  "slug": "the-last-elevator",
  "title": "The Last Elevator",
  "directoryName": "109-the-last-elevator"
}
```

Use the repository’s existing padding width and ID representation.

Do not manually construct episode identifiers in several modules.

## Canonical source filename

Build the canonical English source filename through one shared path utility.

Conceptually:

```text
109-the-last-elevator-en-full.md
```

Store it in the repository’s canonical source directory.

Examples:

```text
episodes/109-the-last-elevator/source/109-the-last-elevator-en-full.md
```

or the existing repository equivalent.

The original imported filename must not determine the final canonical filename.

## Episode manifest initialization

Initialize the episode using the existing manifest schema.

Add import metadata only where compatible.

Conceptually persist:

```json
{
  "schemaVersion": 1,
  "episode": {
    "id": "109",
    "number": 109,
    "slug": "the-last-elevator",
    "title": "The Last Elevator"
  },
  "source": {
    "language": "en",
    "type": "full",
    "path": "source/109-the-last-elevator-en-full.md",
    "sha256": "...",
    "importedAt": "ISO-8601",
    "import": {
      "originalPath": "/external/path/story.md",
      "originalFilename": "story.md",
      "originalSha256": "...",
      "mode": "copy",
      "parsedTitle": "...",
      "parsedEpisodeNumber": 9,
      "warnings": []
    }
  },
  "artifacts": {}
}
```

Do not store a machine-specific absolute external path in a portable manifest unless repository policy permits it.

Prefer:

- original filename;
- source hash;
- optional sanitized import origin;
- an execution log containing the absolute path locally.

If the absolute input path is stored, keep it in non-portable run metadata rather than the canonical episode manifest.

## Global episode index

If the repository maintains a global episode index:

- update it atomically;
- preserve ordering conventions;
- prevent duplicate numbers and slugs;
- validate the index after update;
- avoid concurrent lost updates;
- include the new source path and manifest path;
- use one shared index-update function.

Do not add a new global index if none exists.

## Rewrite pipeline integration

After bootstrapping, invoke the existing full or short rewrite service exactly as if the episode had already existed.

For full stories:

```text
bootstrap episode
→ resolve canonical English source
→ run full-story rewrite for requested languages
→ validate
→ persist
→ update manifest
```

For Shorts:

```text
bootstrap episode
→ resolve canonical English source
→ run short-story rewrite for requested languages
→ validate
→ persist
→ update manifest
```

Do not pass the external input path directly into multiple downstream services after creation.

Once bootstrapped, the canonical source path must become the source of truth for that run.

## Combined full and short generation

Do not automatically generate both formats unless requested.

Each command should create the episode and run only its corresponding pipeline.

Optionally support an orchestration command only when one already exists, such as:

```bash
pnpm cli stories create \
  --input ./incoming/story.md \
  --episode-slug the-last-elevator \
  --full-languages en,de,es,fr,pt \
  --short-languages en,de,es,fr,pt
```

Do not add this broader command unless it fits the existing architecture cleanly.

The mandatory requirement is to extend both existing rewrite commands.

## Language handling

Preserve current rewrite behavior.

For full stories:

- `en` means English-to-English optimization;
- other languages mean localized optimization directly from the canonical English source.

For Shorts:

- `en` means English Short rewriting from the full English source;
- other languages mean localized Short generation directly from the full English source.

Do not generate localized outputs from another localized output.

## Dry-run behavior

`--dry-run` must perform no persistent filesystem changes and no OpenAI calls.

It should report:

- normalized input path;
- source file validation;
- parsed source title;
- parsed source episode number;
- requested slug;
- normalized slug;
- selected or allocated episode number;
- final episode identity;
- canonical episode directory;
- canonical source path;
- manifest path;
- planned rewrite type;
- requested languages;
- expected output files;
- detected conflicts;
- whether creation would succeed.

Example human-readable output:

```text
Mode: create new episode
Input: ./incoming/story.md
Parsed title: The Last Elevator
Requested slug: the-last-elevator
Allocated episode number: 109
Episode directory: episodes/109-the-last-elevator
Canonical source: source/109-the-last-elevator-en-full.md
Rewrite type: full
Languages: en, de, es
OpenAI requests: 0
Filesystem writes: 0
```

For `--json`, emit the structured equivalent.

Do not reserve an episode number permanently during dry-run.

Clearly state that automatic allocation may change before a later real execution when concurrent creation is possible.

## Resume behavior

When a newly created episode completes only some languages:

```bash
pnpm cli stories rewrite-full \
  --episode 109 \
  --languages en,de,es,fr,pt \
  --resume
```

must continue using the canonical source and manifest.

Also support rerunning the original creation command with `--resume` when:

- the episode exists;
- slug and number match;
- source hash matches;
- the import was completed;
- no identity conflict exists.

Do not create a duplicate episode directory.

## Failure behavior

Differentiate:

### Failure before episode creation

No final episode directory or index entry should remain.

### Failure after episode bootstrap but before any rewrite completes

The created episode and canonical source may remain valid.

Record the rewrite failure in run or manifest metadata.

Do not delete a successfully bootstrapped source episode merely because OpenAI failed.

### Partial language failure

Keep all validated completed artifacts.

Record failed languages.

Return a non-zero exit status unless repository policy defines partial success differently.

### Manifest failure

Do not report the artifact as completed unless both generated files and manifest state are consistent.

Use recoverable atomic update patterns.

## Path security

Treat all CLI paths and slugs as untrusted.

Requirements:

- resolve `--input` with `realpath`;
- verify it is a file;
- reject symlink behavior that violates repository policy;
- prevent destination path traversal;
- ensure generated output remains under configured episode root;
- reject NUL bytes;
- reject slashes inside episode slug;
- avoid shell interpolation;
- use Node filesystem APIs rather than shell `cp`;
- never construct commands from user input;
- use normalized relative paths in manifests.

## Filesystem safety

Use:

- `fs.promises`;
- exclusive creation where needed;
- atomic rename;
- temporary files in the destination filesystem;
- deterministic cleanup;
- typed filesystem errors.

Do not use:

- shell `cp`;
- shell `mv`;
- wildcard file matching through a shell;
- unchecked recursive deletion;
- `rm -rf` for rollback.

## Concurrency safety

Two processes must not allocate the same episode number.

Use an existing repository lock implementation where available.

Otherwise implement a small lock or reservation mechanism based on atomic exclusive file creation.

The lock should cover:

- number allocation;
- slug conflict verification;
- episode directory creation;
- global index update.

Requirements:

- bounded acquisition timeout;
- clear error when another creation is in progress;
- stale-lock handling only when it can be done safely;
- cleanup in `finally`;
- no lock during long OpenAI generation after bootstrap is complete.

Do not hold the creation lock while generating localized stories.

## Structured execution result

Return an internal typed result shared by both commands.

Conceptual shape:

```ts
interface RewriteEpisodeExecutionResult {
  runId: string;
  command: "rewrite-full" | "rewrite-short";
  episode: {
    mode: "existing" | "created";
    number: number;
    id: string;
    slug: string;
    title: string;
    directory: string;
    manifestPath: string;
    canonicalSourcePath: string;
    sourceSha256: string;
  };
  requestedLanguages: StoryLanguage[];
  artifacts: Array<{
    language: StoryLanguage;
    status: "completed" | "skipped" | "failed";
    markdownPath?: string;
    jsonPath?: string;
    error?: {
      code: string;
      message: string;
    };
  }>;
  totals: {
    completed: number;
    skipped: number;
    failed: number;
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
    estimatedCostUsd?: number;
    durationMs: number;
  };
}
```

Use existing project result types where suitable.

## Typed errors

Add or reuse domain errors such as:

```ts
InvalidEpisodeSlugError;
EpisodeNumberConflictError;
EpisodeSlugConflictError;
EpisodeIdentityConflictError;
EpisodeAlreadyExistsError;
IncompleteEpisodeDirectoryError;
InvalidStoryMarkdownError;
StoryNarrationMissingError;
ExternalStoryInputNotFoundError;
ExternalStoryInputUnreadableError;
EpisodeAllocationLockError;
EpisodeBootstrapError;
EpisodeManifestInitializationError;
EpisodeIndexUpdateError;
```

Messages must be actionable.

Examples:

```text
Episode slug "the-last-elevator" already belongs to episode 084.
Choose another slug or run the rewrite command with --episode 084.
```

```text
Episode number 109 is already assigned to "the-room-without-a-door".
Omit --episode-number to allocate the next available number.
```

```text
The imported Markdown does not contain a usable narration section.
Expected a Narration Script or Story section, or narrative paragraphs after the title.
```

```text
Episode directory episodes/109-the-last-elevator exists but has no valid manifest.
Resolve or remove the incomplete directory before retrying.
```

Do not expose raw stack traces unless verbose mode is enabled.

## Logging and auditability

Use the existing structured logger.

Record:

- run ID;
- command;
- mode;
- external input filename;
- source hash;
- normalized slug;
- allocated number;
- final episode identity;
- canonical source path;
- source mode;
- manifest path;
- requested languages;
- bootstrap duration;
- rewrite duration;
- token usage;
- cost;
- validation outcomes;
- failure codes.

Do not log:

- API keys;
- full story content;
- authorization headers;
- secrets;
- full prompts at normal level.

## Type safety

Requirements:

- strict TypeScript;
- no new `any`;
- use `unknown` at filesystem, JSON, front-matter, and CLI boundaries;
- runtime validation for all parsed data;
- derive TypeScript types from schemas where practical;
- exhaustive command-mode handling;
- exhaustive source-mode handling;
- immutable constants;
- centralized slug rules;
- centralized path generation;
- centralized episode identity generation;
- no unsafe type assertions to bypass checks;
- JSDoc for exported public APIs;
- inline comments for transactional and locking behavior.

Keep responsibilities separate:

- CLI parsing;
- command-mode resolution;
- Markdown import parsing;
- slug validation;
- episode-number allocation;
- episode identity;
- collision detection;
- bootstrap transaction;
- source persistence;
- manifest initialization;
- global index update;
- full rewrite;
- short rewrite;
- result reporting.

## Suggested module structure

Adapt to the existing repository.

A possible shared structure:

```text
stories/
  episode-bootstrap/
    episode-bootstrap.service.ts
    episode-bootstrap.types.ts
    episode-bootstrap.schemas.ts
    episode-bootstrap.errors.ts
    episode-bootstrap.constants.ts
    episode-identity.ts
    episode-number-allocator.ts
    episode-creation-lock.ts
    episode-collision-detector.ts
    story-markdown-importer.ts
    episode-source-writer.ts
    episode-manifest-initializer.ts
```

Then update:

```text
full-story-rewrite/
short-story-rewrite/
```

to consume the shared service.

Do not force this layout when the repository already has an appropriate domain module.

## Tests

Add comprehensive tests with no real OpenAI calls.

### CLI argument tests

Cover:

- existing episode by number;
- existing episode by slug;
- new episode from input and slug;
- explicit episode number;
- inferred episode number;
- explicit title;
- default title from Markdown;
- default title from slug;
- invalid option combinations;
- missing slug in creation mode;
- missing input;
- conflicting episode and slug;
- resume and overwrite conflict;
- dry-run;
- JSON output.

### Slug tests

Cover:

- valid slug;
- uppercase normalization;
- whitespace normalization;
- repeated hyphens;
- leading and trailing hyphens;
- slash rejection;
- `..` rejection;
- Unicode handling according to chosen policy;
- excessive length;
- empty slug;
- reserved names;
- deterministic humanized title.

### Markdown parser tests

Cover:

- complete sample format;
- narration under H1;
- narration under H2;
- front matter;
- missing audio section;
- missing sound motif;
- no narration heading;
- plain narrative Markdown;
- blockquotes in production instructions;
- dialogue blockquotes inside narration;
- fenced code not treated as narration;
- HTML comments;
- empty narration;
- Short supplied as full source;
- source title extraction;
- source number extraction;
- injection-like instructions.

### Episode-number tests

Cover:

- next number allocation;
- gaps in numbering;
- explicit free number;
- explicit occupied number;
- duplicate manifest number;
- duplicate directory number;
- duplicate slug;
- malformed episode directory ignored or rejected according to policy;
- concurrent allocation;
- lock timeout;
- dry-run without permanent reservation.

### Bootstrap tests

Cover:

- successful copy mode;
- successful normalize mode;
- source remains unchanged;
- canonical filename;
- correct episode directory;
- correct initial manifest;
- global index update;
- failure before final rename leaves no episode;
- staging cleanup;
- existing matching episode reuse during resume;
- existing different source hash rejected;
- incomplete episode directory rejected;
- source and destination collision prevented.

### Rewrite integration tests

With mocked full and short rewrite services, cover:

- full rewrite starts after bootstrap;
- short rewrite starts after bootstrap;
- canonical source path passed downstream;
- external input path is not used downstream after bootstrap;
- English rewrite included;
- localized languages included;
- partial language failure;
- rewrite failure does not remove valid bootstrapped episode;
- manifest updated with artifacts;
- existing-episode behavior remains unchanged.

### Filesystem security tests

Cover:

- slug path traversal;
- destination escape;
- symlink input policy;
- symlink output policy;
- NUL byte rejection;
- absolute path input;
- input outside repository;
- unreadable file;
- non-file input;
- extension validation;
- temporary write cleanup.

### Dry-run tests

Verify:

- no directory created;
- no manifest created;
- no source copied;
- no index updated;
- no lock reservation remains;
- no OpenAI request;
- all planned paths returned;
- detected conflicts reported.

### End-to-end CLI tests

Using fixtures and mocked OpenAI:

```bash
rewrite-full --input fixture.md --episode-slug imported-story --languages en,de
```

Verify:

- episode created;
- canonical source stored;
- English optimized full output written;
- German full output written;
- sidecars written;
- manifest updated.

Then:

```bash
rewrite-short --episode <allocated-number> --languages en,de
```

Verify Shorts are generated from the canonical full English source.

Also test the reverse order:

```bash
rewrite-short --input fixture.md --episode-slug imported-story --languages en,de
```

followed by full generation for the created episode.

## Documentation

Update CLI and episode workflow documentation.

Document:

- existing-episode mode;
- new-episode mode;
- accepted Markdown structure;
- required `--episode-slug`;
- optional `--episode-number`;
- automatic number allocation;
- collision handling;
- source copy versus normalization;
- canonical source path;
- source preservation;
- full versus Short command behavior;
- English-to-English rewriting;
- localized rewriting;
- resume;
- overwrite protection;
- dry-run;
- concurrency safety;
- manifest initialization;
- downstream compatibility.

Include examples:

```bash
# Create a new episode and generate full stories
pnpm cli stories rewrite-full \
  --input ./incoming/story.md \
  --episode-slug the-last-elevator \
  --languages en,de,es,fr,pt
```

```bash
# Create a new episode with an explicit number
pnpm cli stories rewrite-full \
  --input ./incoming/story.md \
  --episode-number 109 \
  --episode-slug the-last-elevator \
  --languages en,de
```

```bash
# Create a new episode and generate Shorts
pnpm cli stories rewrite-short \
  --input ./incoming/story.md \
  --episode-slug the-last-elevator \
  --languages en,de,es,fr,pt
```

```bash
# Preview episode allocation and output paths
pnpm cli stories rewrite-full \
  --input ./incoming/story.md \
  --episode-slug the-last-elevator \
  --languages en,de \
  --dry-run
```

```bash
# Continue generation after a partial failure
pnpm cli stories rewrite-full \
  --episode 109 \
  --languages en,de,es,fr,pt \
  --resume
```

## Validation commands

Run the repository equivalents of:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Also run:

- focused Markdown importer tests;
- episode allocation tests;
- bootstrap transaction tests;
- full rewrite integration tests;
- short rewrite integration tests;
- CLI help;
- creation-mode dry-run;
- existing-episode dry-run;
- JSON-output dry-run.

Do not call the real OpenAI API unless the repository already provides an explicit paid integration-test command and suitable credentials are configured.

Do not modify unrelated code merely to fix pre-existing failures. Report those failures separately.

## Important constraints

- Implement directly on the current branch.
- Do not create a branch.
- Do not commit or push.
- Extend existing rewrite utilities.
- Do not create duplicate rewrite pipelines.
- Use one shared episode bootstrap service.
- Preserve the external source.
- Preserve all unrelated working-tree changes.
- Never overwrite an existing episode source silently.
- Never allocate a duplicate episode number or slug.
- Never leave half-created episode state after bootstrap failure.
- Do not hold a creation lock during OpenAI generation.
- Do not use localized stories as sources for other localizations.
- Do not create conflicting manifests or indexes.
- Do not use shell commands for untrusted paths.
- Do not stop after planning.

## Completion criteria

The task is complete only when:

1. both full and short rewrite commands accept external Markdown input;
2. both accept a target episode slug;
3. new-episode mode creates a canonical episode safely;
4. existing-episode behavior remains backward-compatible;
5. optional episode-number allocation works safely;
6. collisions are detected across directories, manifests, and indexes;
7. Markdown source parsing is structured and validated;
8. the external source remains unchanged;
9. the canonical English source is written safely;
10. episode creation is transactional;
11. manifests and any existing index are initialized atomically;
12. the canonical source becomes the downstream source of truth;
13. the selected rewrite pipeline starts automatically after bootstrap;
14. English and localized outputs are supported;
15. dry-run performs no writes and no OpenAI calls;
16. resume can continue the newly created episode;
17. partial rewrite failures preserve the valid bootstrapped episode;
18. paths and slugs are protected against traversal;
19. concurrent episode allocation cannot create duplicates;
20. tests cover bootstrap, parsing, collisions, dry-run, full rewrite, and short rewrite;
21. linting, type checking, tests, and build have been run;
22. documentation includes complete CLI examples;
23. unrelated working-tree changes remain intact.

Implement the complete functionality now. Make repository-compatible decisions, preserve existing behavior, and provide a final report with changed files, test results, assumptions, and remaining limitations.
