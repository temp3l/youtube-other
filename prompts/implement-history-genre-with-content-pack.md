# Codex Implementation Prompt — History Documentary Genre with Initial 10-Video Content Pack

## Mission

Implement a production-grade `history` genre in the existing YouTube production repository and integrate the existing content pack located at:

```text
content-packs/youtube-history-10-video-story-pack/
```

The content pack is mandatory implementation input. It must be imported through a reusable, typed, validated content-pack ingestion path rather than copied into runtime directories or handled through one-off scripts.

The genre must support high-quality, factually grounded history documentaries in multiple formats and languages, using the repository's existing story/script, localization, speech, image, composition, rendering, publishing, workflow-state, observability, and provider abstractions.

Do not create a parallel implementation. Extend the canonical genre architecture and reuse existing pipeline services, contracts, paths, naming conventions, workflow logs, CLI commands, asset stores, provider interfaces, validation infrastructure, and release gates.

The implementation must be backward compatible with all existing genres, especially:

- horror
- math education
- `veronicaBenini`
- generic/dynamically derived genres

Use multi-agent execution with parallel work only where file ownership and dependencies are clearly non-overlapping.

---

## Operating mode

Work autonomously from repository evidence.

1. Inspect the repository before changing code.
2. Identify the canonical genre registration, configuration, prompt, localization, rendering, asset, CLI, workflow, and publishing paths.
3. Detect duplicate or legacy implementations and avoid extending them.
4. Record assumptions and unresolved operator decisions.
5. Prefer small, reviewable commits or implementation checkpoints.
6. Run focused tests after each bounded change.
7. Finish with repository-wide validation relevant to the modified surfaces.
8. Do not stop after planning. Implement, test, document, and verify the genre.

Do not ask the operator questions unless a genuinely blocking decision cannot be safely derived from repository conventions. For non-blocking ambiguity, choose a conservative default, document it, and continue.

---

## Primary outcome

After implementation, an operator must be able to select `history` as a genre and produce:

- short-form history videos;
- standard documentaries;
- long-form documentaries;
- multilingual variants;
- narration audio using any supported TTS provider;
- historical image and scene prompts;
- maps, timelines, diagrams, quotations, and source cards where supported;
- thumbnails, titles, descriptions, chapters, metadata, and publishing assets;
- deterministic workflow-state and audit information;
- evidence-backed scripts with explicit uncertainty handling.

The first implementation should include multiple documentary presets rather than treating all history content as one visual or narrative style.

It must also import the ten supplied scripts as canonical History episodes without modifying the source pack, while keeping every episode blocked from publication until the repository's factual, media, and release validation stages have passed.

---


# Mandatory content-pack integration

The repository is expected to contain this directory:

```text
content-packs/youtube-history-10-video-story-pack/
├── 01-bronze-age-collapse.md
├── 02-napoleons-invasion-of-russia.md
├── 03-fall-of-the-roman-empire.md
├── 04-black-death.md
├── 05-franklin-expedition.md
├── 06-mongol-war-machine.md
├── 07-day-life-medieval-peasant.md
├── 08-cuban-missile-crisis.md
├── 09-cleopatra-beyond-legend.md
├── 10-titanic-decisions-disaster.md
├── README.md
└── manifest.json
```

Treat this directory as an immutable editorial source pack.

Do not:

- move the source files into generated episode directories;
- rewrite the Markdown files in place;
- silently normalize or delete source metadata;
- treat the files as already fact-checked for publication;
- use their provisional chapter timestamps as final media timestamps;
- create hard-coded logic that only works for these ten filenames;
- bypass the canonical workflow because scripts already exist;
- infer that `production-ready-draft` means publish-ready.

The importer must be reusable for future History content packs that follow the same or a versioned successor contract.

## Observed pack-level contract

`README.md` defines the writer persona and editorial intent:

```text
Cinematic Public Historian — a documentary writer who combines narrative
tension, historiographical caution, primary-source awareness, and accessible
explanation.
```

The pack uses:

- a cinematic but nonfiction-first style;
- human-scale openings;
- systems, incentives, and decisions rather than simplistic great-person mythology;
- explicit separation of evidence, interpretation, and unresolved debate;
- no invented dialogue or unsupported internal thoughts;
- restrained treatment of death, violence, and suffering;
- conclusions based on durable historical insight;
- approximately 104–112 spoken words per minute;
- roughly ten-minute scripts.

`manifest.json` currently contains:

- `persona`;
- `videos[]`;
- each video's `file`;
- `title`;
- `word_count`;
- `estimated_minutes_at_108_wpm`.

The importer must validate the manifest against the actual files rather than trusting it.

## Observed Markdown frontmatter contract

Every supplied story currently uses these top-level YAML fields:

```yaml
title: string
slug: string
genre: "history-documentary"
format: "long-form-youtube-video"
language: "en"
status: "production-ready-draft"
writer_persona: string
target_duration_minutes: number
estimated_duration_minutes_at_108_wpm: number
script_word_count: number
narration_pace: string
audience: string
tone: string
period: string
regions: string[]
hook: string
seo_title: string
seo_description: string
keywords: string[]
tags: string[]
thumbnail_text: string
content_warnings: string[]
fact_check_status: string
```

The importer must parse YAML using an existing safe YAML dependency where available. Do not implement YAML parsing with regular expressions.

Reject YAML features that create unsafe or ambiguous behavior if the selected parser supports such features, including arbitrary object construction.

Preserve:

- the complete original frontmatter;
- unknown extension fields;
- source filename;
- source-relative path;
- source checksum;
- import contract version;
- import timestamp;
- importer version.

Unknown fields must not be silently discarded. Store them as typed extension metadata or emit an actionable compatibility warning according to repository conventions.

## Observed Markdown section contract

Every supplied story currently contains these level-two sections:

```text
## Core hook
## Chapter plan
## Documentary story / narration
## Visual direction
## Thumbnail direction
## Fact-check and editorial notes
## Research sources
```

Parse sections by Markdown AST if the repository already has a Markdown parser. Prefer a standards-compliant Markdown parser over brittle heading slicing.

Required behavior:

- preserve source order;
- tolerate insignificant whitespace;
- support Unicode punctuation;
- report duplicate required sections;
- report missing required sections;
- preserve additional unknown sections as extensions;
- reject ambiguous multiple narration sections unless an explicit compatibility rule exists;
- preserve links as structured links and original Markdown;
- preserve blockquotes, emphasis, and Unicode names.

## Canonical normalization rules

Implement a versioned adapter from the content-pack contract into the canonical History episode contracts.

### Genre alias

Normalize:

```text
history-documentary -> history
```

Requirements:

- treat `history-documentary` as a supported content import alias;
- persist the original value;
- use `history` as the canonical runtime genre ID;
- do not register a second runtime genre named `history-documentary`;
- reject unrelated genre values unless an explicit operator override is supplied.

### Format normalization

The source files use:

```text
long-form-youtube-video
```

Despite that label, their measured sizes are approximately 1,076–1,158 words and approximately 10.0–10.7 minutes at 108 WPM.

Normalize these ten supplied scripts to:

```text
standard
```

Do not classify them as the proposed 15–25-minute `long` format.

Implement the rule through explicit import compatibility configuration, not a global assumption that every `long-form-youtube-video` file always maps to `standard`.

Persist:

- original format;
- canonical format;
- reason for normalization;
- source duration estimate;
- canonical duration estimate.

A suitable compatibility rule is conceptually:

```ts
interface HistoryFormatImportRule {
  readonly sourceFormat: string;
  readonly canonicalFormat: "short" | "standard" | "long";
  readonly appliesWhen: {
    readonly targetDurationMinutes?: {
      readonly minInclusive: number;
      readonly maxInclusive: number;
    };
    readonly wordCount?: {
      readonly minInclusive: number;
      readonly maxInclusive: number;
    };
  };
  readonly reason: string;
}
```

Reuse existing import/compatibility abstractions if equivalent contracts already exist.

### Audience normalization

Normalize the pack's free-text audience:

```text
general history audience, ages 16+
```

to the canonical audience level:

```text
general
```

Preserve the original audience string as editorial metadata.

Do not infer a legal age rating from this field.

### Language normalization

Normalize:

```text
en
```

through the repository's canonical locale system.

Use the English script as the canonical source script for subsequent localization.

Do not rewrite the source file when localized versions are generated.

### Status normalization

Normalize:

```text
production-ready-draft
```

to a safe canonical state equivalent to:

```text
draft
```

with:

```text
validationStatus: pending
publishReady: false
```

The exact names must follow existing workflow and manifest contracts.

The source value means editorially developed, not historically verified and technically rendered.

### Fact-check normalization

The source field generally states that research was performed and final verification is recommended.

Normalize it to:

- research provenance present;
- final factual validation required;
- claim extraction pending unless already generated;
- source assessment pending;
- quotation verification pending where quotations exist;
- chronology validation pending;
- publish readiness blocked.

Do not promote an episode to publish-ready based solely on `fact_check_status`.

### Period normalization

Preserve the free-text period, such as:

```text
c. 1250–1150 BCE
```

Also derive the canonical period taxonomy and optional structured date range where it can be done deterministically.

Examples:

- Bronze Age Collapse → `ancient`;
- medieval peasant → `medieval`;
- Napoleon → `industrial age` or the repository's nearest canonical classification;
- Cuban Missile Crisis → `modern` or `contemporary history` according to the final taxonomy.

Do not fabricate exact start/end dates from vague period strings. Store parsing confidence and preserve the source string.

### Geographic normalization

Convert `regions: string[]` into the canonical geographic scope model while retaining the original labels.

Do not geocode or attach coordinates unless the repository has an explicit research-backed geospatial step.

### Runtime and narration normalization

Preserve:

- `target_duration_minutes`;
- `estimated_duration_minutes_at_108_wpm`;
- `script_word_count`;
- `narration_pace`.

Recalculate the actual word count from the parsed narration and compare it with:

- YAML `script_word_count`;
- `manifest.json` `word_count`.

Use a documented tokenizer appropriate for narration words.

Emit:

- error for missing narration;
- error for impossible or negative values;
- warning or error for material count mismatches, based on configured tolerance;
- calculated duration using the selected final voice preset;
- provisional duration before TTS;
- actual duration after TTS.

The final chapter timestamps must be generated from actual audio timing and must replace provisional timestamps only in generated artifacts—not in source Markdown.

## Mandatory topic-to-preset mapping

For the supplied ten scripts, use this explicit deterministic mapping:

| Source file | Canonical preset |
|---|---|
| `01-bronze-age-collapse.md` | `civilization-rise-fall` |
| `02-napoleons-invasion-of-russia.md` | `military-campaign` |
| `03-fall-of-the-roman-empire.md` | `civilization-rise-fall` |
| `04-black-death.md` | `disaster-pandemic-survival` |
| `05-franklin-expedition.md` | `archaeology-mystery` |
| `06-mongol-war-machine.md` | `military-campaign` |
| `07-day-life-medieval-peasant.md` | `everyday-life` |
| `08-cuban-missile-crisis.md` | `world-war-geopolitics` |
| `09-cleopatra-beyond-legend.md` | `historical-biography` |
| `10-titanic-decisions-disaster.md` | `disaster-pandemic-survival` |

Implement this as pack-versioned import metadata or a pack manifest overlay.

Do not scatter filename conditionals throughout the codebase.

A suitable content-pack overlay concept is:

```ts
interface HistoryContentPackEpisodeOverlay {
  readonly sourceFile: string;
  readonly presetId: HistoryDocumentaryPresetId;
  readonly canonicalFormat: "standard";
  readonly audienceLevel: "general";
  readonly requiredFeatures: {
    readonly maps: boolean;
    readonly timeline: boolean;
    readonly relationshipDiagram?: boolean;
    readonly processDiagram?: boolean;
  };
  readonly sensitivityTags: readonly string[];
}
```

Derive exact map/timeline flags from the episode content and preset, but keep the preset mapping deterministic.

## Pack manifest validation

Validate `manifest.json` against the filesystem and Markdown sources.

Required checks:

- every manifest file exists;
- every expected story file is represented once;
- no duplicate manifest entries;
- no path traversal;
- no absolute paths;
- no symlink escape outside the pack root;
- manifest title matches Markdown title or produces a documented warning;
- manifest word count matches calculated narration count within tolerance;
- manifest duration is mathematically consistent with its declared WPM;
- no unlisted story files unless the import mode explicitly permits discovery;
- README and manifest are not treated as episodes;
- sorting is deterministic;
- filenames are normalized safely without changing source paths.

Support two modes if consistent with repository conventions:

```text
strict    — manifest is authoritative; mismatches fail import
lenient   — mismatches produce warnings where safe, but unsafe conditions fail
```

Use `strict` by default for CI and production import.

## Original-source immutability and provenance

For every imported episode, calculate a cryptographic checksum of:

- the source Markdown file;
- the pack manifest;
- optionally the README/editorial contract.

Use the repository's existing checksum algorithm where one exists. Otherwise prefer SHA-256.

Persist provenance conceptually equivalent to:

```ts
interface ImportedContentProvenance {
  readonly packId: "youtube-history-10-video-story-pack";
  readonly packContractVersion: string;
  readonly sourceRelativePath: string;
  readonly sourceSha256: string;
  readonly manifestSha256: string;
  readonly importedAt: string;
  readonly importerVersion: string;
  readonly originalGenre: string;
  readonly originalFormat: string;
  readonly originalStatus: string;
}
```

Do not use timestamps as the only idempotency key.

Reimport behavior must be deterministic:

- unchanged source checksum → no-op or exact idempotent replay;
- changed source checksum → create a new source revision or mark the derived episode stale according to repository conventions;
- conflicting canonical episode slug/ID → fail safely or use a documented revision strategy;
- partially imported pack → resume without duplicating completed imports;
- importer crash → leave recoverable state and no corrupt manifest.

## Episode identity and collision handling

Derive stable episode identity from explicit source metadata and pack identity, not only the current filename.

Prefer a stable ID such as:

```text
history:<pack-id>:<source-slug>
```

adapted to repository conventions.

Handle:

- duplicate slugs inside one pack;
- same slug across different packs;
- existing manually created episode with the same public slug;
- reimport after source correction;
- renamed source file with unchanged canonical source ID, if future contracts support an explicit source ID.

Never silently overwrite a manually authored episode.

## Import outputs

For each source story, create canonical generated artifacts equivalent to:

```text
episode manifest
source import provenance
normalized metadata
canonical English script
provisional chapter plan
research-source inventory
editorial notes
visual-direction input
thumbnail-direction input
validation report
workflow log/checkpoint
```

The exact paths must follow existing repository conventions.

The canonical script artifact should contain only the narration intended for speech, not:

- YAML;
- chapter headings;
- thumbnail instructions;
- fact-check notes;
- source list.

Preserve all non-narration sections in structured editorial artifacts.

## Chapter plan import

Parse chapter entries such as:

```text
- **00:00** — The night the palace burned
```

into structured provisional chapters.

Validate:

- timestamp syntax;
- monotonic ordering;
- no duplicate timestamps;
- first chapter starts at or near zero;
- timestamps do not materially exceed estimated duration;
- title is non-empty.

Mark them as:

```text
timingSource: editorial-estimate
provisional: true
```

After final audio generation:

- align sections to actual speech timing;
- regenerate chapter timestamps;
- persist editorial and final versions;
- use only final timestamps for publishing;
- never mutate the source file.

## Research-source import

Parse the `Research sources` section into structured source candidates.

For every link, preserve:

- visible title;
- URL;
- source domain;
- original Markdown;
- source position;
- episode association.

Then run it through the History source-quality workflow.

Important:

- imported links are source candidates, not automatically approved evidence;
- URL presence does not prove the source was sufficient for every script claim;
- detect malformed and duplicate URLs;
- do not fetch sources during offline parsing tests;
- do not claim that a source was consulted by the new system until the research/verification stage records it;
- preserve a distinction between pack-declared source and system-verified source;
- do not invent claim-to-source mappings from a bibliography alone.

A suitable status distinction is:

```ts
type ImportedSourceStatus =
  | "declared-by-pack"
  | "retrieved"
  | "assessed"
  | "approved"
  | "rejected"
  | "unavailable";
```

## Hook import

The YAML `hook` and `Core hook` section should be compared.

- identical semantic content → retain one canonical hook and both provenance locations;
- textual mismatch → warning;
- material contradiction → import error in strict mode.

Do not require byte-identical punctuation if normalized text is semantically equivalent.

## Visual-direction import

Parse `Visual direction` as editorial input.

Do not pass it directly as an unvalidated image-generation prompt.

Transform it through the selected preset into structured visual beats containing:

- period;
- location;
- culture/polity;
- subject;
- historically relevant clothing/architecture/objects;
- shot purpose;
- reconstruction status;
- anti-anachronism constraints;
- sensitivity constraints;
- source/evidence requirements where applicable.

## Thumbnail-direction import

Parse:

- on-image text;
- generation prompt.

Normalize thumbnail text against the configured maximum length.

Treat the supplied prompt as an editorial concept, then pass it through canonical thumbnail planning and safety validation.

Do not assume the supplied prompt is historically sufficient merely because it is present.

## Editorial and fact-check notes import

Store these sections as editorial constraints.

Convert actionable statements into validation requirements where deterministic.

Examples:

- "check dates" → chronology/date validation requirement;
- "avoid fabricated quotations" → quotation validation policy;
- "pronunciation guidance should be added" → pending pronunciation workflow task.

Do not discard prose notes after deriving structured requirements.

## Writer persona integration

Register or reference the pack persona through the canonical persona/prompt system:

```text
Cinematic Public Historian
```

It should be available as a History writer preset, but it must not override:

- evidence policy;
- selected documentary preset;
- locale;
- safety constraints;
- provider configuration;
- explicit operator settings.

Avoid embedding the complete persona in every prompt if the prompt-composition system supports reusable bounded modules.

## Import CLI and workflow

Integrate content-pack operations into the canonical CLI.

Use existing command naming. Equivalent capabilities should include:

```bash
mediaforge content-pack inspect \
  content-packs/youtube-history-10-video-story-pack

mediaforge content-pack validate \
  content-packs/youtube-history-10-video-story-pack \
  --genre history \
  --strict

mediaforge content-pack import \
  content-packs/youtube-history-10-video-story-pack \
  --genre history \
  --strict

mediaforge content-pack import \
  content-packs/youtube-history-10-video-story-pack \
  --genre history \
  --dry-run

mediaforge workflow status <episode-id>
mediaforge workflow next <episode-id>
```

If the repository uses different commands, implement equivalent operations in the existing command hierarchy.

The import command must report:

- discovered files;
- validated files;
- rejected files;
- no-op unchanged files;
- imported episodes;
- warnings;
- preset assignment;
- canonical format assignment;
- pending validation stages;
- artifact locations;
- next commands.

Support machine-readable output if the CLI already supports JSON output.

## Batch behavior

Import all ten episodes as a bounded batch.

Required properties:

- deterministic order;
- bounded concurrency;
- per-file error isolation;
- configurable fail-fast versus collect-errors behavior;
- no partial silent success;
- aggregate report;
- resumable state;
- idempotent rerun;
- no paid API calls during structural import;
- research and generation remain separate workflow stages.

Structural import must be fast and offline.

## Initial workflow state after import

Every imported episode should begin with completed tasks equivalent to:

```text
content source discovered
content pack structurally validated
source provenance recorded
metadata normalized
canonical script extracted
editorial sections extracted
preset assigned
```

Pending tasks should include:

```text
source retrieval/assessment
claim extraction
claim-to-source mapping
chronology validation
quotation verification
historical factuality audit
script repair if required
pronunciation planning
visual beat planning
map/timeline planning
localization
audio generation
final chapter alignment
image generation
video rendering
thumbnail rendering
publish validation
```

Do not mark research or factual validation complete merely because the source pack lists references.

## Pack-specific validation tests

Add fixture-based tests using the real pack where repository policy allows, or a representative sanitized copy where tests must remain isolated.

Test:

1. all ten files import successfully in strict mode;
2. the exact preset mapping is applied;
3. all ten formats normalize to `standard`;
4. `history-documentary` normalizes to `history`;
5. `production-ready-draft` does not produce publish-ready state;
6. original metadata is preserved;
7. the source files remain byte-identical;
8. checksums are stable;
9. rerunning import is idempotent;
10. changed source content invalidates or revisions derived artifacts;
11. missing manifest file fails safely;
12. manifest entry for a missing file fails;
13. unlisted file behavior follows mode;
14. path traversal entries are rejected;
15. duplicate slugs are rejected;
16. malformed YAML is rejected with file and line context;
17. missing narration is rejected;
18. missing optional section behavior is documented;
19. duplicate required section is rejected;
20. Markdown Unicode and curly punctuation are preserved;
21. provisional chapters parse and remain provisional;
22. actual audio timing can replace publishing timestamps;
23. declared research URLs remain unapproved until assessed;
24. unknown frontmatter fields are retained;
25. existing manually authored episodes are not overwritten;
26. partial batch failure can be resumed;
27. dry-run writes no production artifacts;
28. no external provider is called during import tests;
29. existing content-pack importers remain compatible;
30. all existing genres remain unaffected.

## Pack-specific acceptance criteria

- [ ] The directory `content-packs/youtube-history-10-video-story-pack` is detected.
- [ ] `README.md` and `manifest.json` are validated and preserved.
- [ ] All ten source Markdown files are parsed through one reusable importer.
- [ ] The importer is versioned and not filename-hard-coded outside a pack overlay.
- [ ] Original files are not modified.
- [ ] Original metadata and unknown fields are retained.
- [ ] Genre alias normalization is implemented.
- [ ] Format normalization to `standard` is implemented for this pack.
- [ ] Audience, language, period, geography, runtime, and status are normalized.
- [ ] The explicit ten-file preset mapping is implemented.
- [ ] Source checksums and provenance are persisted.
- [ ] Import is idempotent and resumable.
- [ ] Canonical narration is separated from editorial metadata.
- [ ] Chapters remain provisional until final TTS alignment.
- [ ] Research links are treated as unverified source candidates.
- [ ] Imported episodes remain blocked from publication pending factual validation.
- [ ] CLI inspect, validate, dry-run, import, status, and next-step behavior exists.
- [ ] Structural import performs no paid API calls.
- [ ] Pack-specific unit, schema, integration, and regression tests pass.


# Phase 1 — Repository audit

Before implementation, map the canonical code paths for:

- genre definitions and registration;
- genre schemas and validation;
- prompt loading and composition;
- script/story planning;
- fact extraction and fact validation;
- localization;
- TTS provider selection;
- cloned-voice configuration;
- image provider selection;
- image prompt generation;
- reference-image handling;
- timelines, maps, captions, overlays, and diagrams;
- video composition and rendering;
- thumbnail generation;
- YouTube metadata generation;
- CLI commands;
- API contracts, if the API implementation is present;
- frontend genre selection, if the frontend implementation is present;
- workflow log/checkpoint state;
- episode manifests;
- artifact paths and filenames;
- observability, metrics, tracing, and structured logging;
- test fixtures and release gates.

Create or update an implementation note containing:

- canonical extension points;
- obsolete or duplicate paths discovered;
- files changed;
- migration impact;
- assumptions;
- decisions made;
- deferred improvements.

Do not implement the genre through a one-off branch in the CLI or renderer.

---

# Phase 2 — Canonical genre model

Add `history` to the canonical genre registry using the same typed mechanisms as other production genres.

Use strict TypeScript types. Avoid untyped dictionaries, implicit `any`, unsafe casts, stringly typed preset names, and duplicated configuration contracts.

## Required identifiers

Use stable identifiers similar to:

```ts
type HistoryDocumentaryPresetId =
  | "military-campaign"
  | "civilization-rise-fall"
  | "historical-biography"
  | "archaeology-mystery"
  | "world-war-geopolitics"
  | "royal-court-intrigue"
  | "everyday-life"
  | "disaster-pandemic-survival"
  | "technology-trade-transformation"
  | "dark-strange-history";
```

Adapt naming to existing repository conventions where necessary, but preserve the semantic distinction between presets.

## Required typed configuration

The genre configuration should support, using existing shared contracts where possible:

```ts
interface HistoryGenreConfig {
  readonly genreId: "history";
  readonly presetId: HistoryDocumentaryPresetId;
  readonly format: "short" | "standard" | "long";
  readonly period?: HistoricalPeriod;
  readonly geographicScope?: GeographicScope;
  readonly audienceLevel: "general" | "enthusiast" | "academic-lite";
  readonly narrativeMode:
    | "chronological"
    | "investigative"
    | "biographical"
    | "strategic-analysis"
    | "day-in-the-life"
    | "rise-and-fall";
  readonly evidencePolicy: HistoryEvidencePolicy;
  readonly visualPreset: HistoryVisualPreset;
  readonly audioPreset: HistoryAudioPreset;
  readonly metadataPreset: HistoryMetadataPreset;
}
```

Do not duplicate generic format, locale, provider, voice, aspect-ratio, publishing, or workflow fields if they already exist in shared contracts.

## Historical periods

Support a validated period taxonomy without forcing every episode into an exact date:

- prehistory;
- ancient;
- late antiquity;
- medieval;
- early modern;
- industrial age;
- modern;
- contemporary history;
- cross-period.

Allow optional explicit year/date ranges.

## Geographic scope

Support:

- global;
- regional;
- country;
- empire/civilization;
- city/site;
- battlefield/route;
- custom structured scope.

---

# Phase 3 — Documentary presets

Implement the following presets with distinct narrative, visual, pacing, and metadata behavior.

## 1. `military-campaign`

Suitable for wars, battles, invasions, commanders, logistics, and strategy.

### Narrative characteristics

- strategic context;
- opposing objectives;
- force composition where reliable;
- terrain and logistical constraints;
- chronological campaign phases;
- turning points;
- outcome and consequences;
- distinction between tactical, operational, and strategic claims.

### Visual characteristics

- animated or staged maps;
- arrows, fronts, routes, borders, and controlled territory;
- unit markers;
- terrain diagrams;
- timeline anchors;
- archival imagery where licensed and supported;
- restrained cinematic battlefield reconstructions.

### Defaults

- narrative mode: `strategic-analysis`;
- pacing: deliberate but high-retention;
- map density: high;
- speculative reconstruction: low;
- title style: decisive event plus consequence.

---

## 2. `civilization-rise-fall`

Suitable for empires, societies, state formation, prosperity, crises, and collapse.

### Narrative characteristics

- origins;
- geography and resources;
- political institutions;
- economy and trade;
- social structure;
- expansion or flourishing;
- internal and external pressures;
- collapse, transformation, or continuity;
- avoid monocausal collapse explanations unless strongly supported.

### Visual characteristics

- regional maps;
- city reconstructions;
- architecture;
- trade routes;
- population and climate diagrams where evidence exists;
- rise-and-fall timelines;
- archaeological artifacts.

### Defaults

- narrative mode: `rise-and-fall`;
- pacing: atmospheric and analytical;
- map density: medium;
- timeline density: high;
- title style: civilization plus central explanatory question.

---

## 3. `historical-biography`

Suitable for rulers, generals, scientists, explorers, reformers, artists, and other historical figures.

### Narrative characteristics

- formative context;
- ambitions and constraints;
- pivotal decisions;
- allies and rivals;
- documented achievements;
- failures and controversies;
- historical legacy;
- separate contemporary evidence from later legend.

### Visual characteristics

- portraits and period artwork;
- location imagery;
- documents and letters;
- relationship diagrams;
- chronological life timeline;
- maps for travel, campaigns, or rule.

### Defaults

- narrative mode: `biographical`;
- emotional intensity: medium;
- quotation density: controlled and source-backed;
- title style: person plus contradiction, ambition, or downfall.

---

## 4. `archaeology-mystery`

Suitable for lost cities, tombs, expeditions, unidentified events, and unresolved questions.

### Narrative characteristics

- discovery hook;
- known evidence;
- competing interpretations;
- archaeological methods;
- evidentiary gaps;
- what remains unresolved;
- avoid presenting speculation as fact;
- explicitly label outdated or fringe theories.

### Visual characteristics

- excavation sites;
- artifact close-ups;
- site maps;
- layered reconstructions;
- evidence boards;
- expedition routes;
- careful reveal structure.

### Defaults

- narrative mode: `investigative`;
- mystery intensity: high;
- uncertainty markers: mandatory;
- title style: unresolved question without dishonest certainty.

---

## 5. `world-war-geopolitics`

Suitable for the World Wars, dictatorships, revolutions, espionage, nuclear confrontation, and Cold War crises.

### Narrative characteristics

- geopolitical context;
- decision-makers and institutions;
- ideology without propaganda;
- military and civilian consequences;
- documented chronology;
- primary-source-aware treatment;
- careful handling of atrocities and extremist symbolism;
- no glorification.

### Visual characteristics

- political maps;
- campaign maps;
- archival-style framing;
- documents, speeches, and newspapers;
- alliance diagrams;
- operational timelines;
- content warnings when appropriate.

### Defaults

- narrative mode: `chronological` or `strategic-analysis`;
- sensitivity level: high;
- source threshold: high;
- graphic imagery: disabled by default.

---

## 6. `royal-court-intrigue`

Suitable for dynasties, succession crises, marriage alliances, court politics, scandals, and royal downfall.

### Narrative characteristics

- dynasty and succession context;
- relationship map;
- incentives and rivalries;
- verified scandal versus later gossip;
- political consequences;
- legal and religious context;
- avoid sensational claims unsupported by credible evidence.

### Visual characteristics

- family trees;
- palaces;
- portraits;
- letters;
- seals and documents;
- succession timelines;
- court maps and relationship diagrams.

### Defaults

- narrative mode: `biographical` or `investigative`;
- character density: high;
- family-tree support: enabled;
- title style: dynasty/person plus conflict or scandal.

---

## 7. `everyday-life`

Suitable for daily routines, work, food, hygiene, childhood, gender roles, travel, education, and social class.

### Narrative characteristics

- define whose everyday life is depicted;
- distinguish class, gender, age, region, occupation, and period;
- avoid pretending one person's experience represented an entire society;
- sensory detail grounded in evidence;
- day-in-the-life or thematic structure;
- include material culture and practical constraints.

### Visual characteristics

- homes and streets;
- clothing;
- tools;
- food preparation;
- workshops;
- farms;
- markets;
- board-style labels or cutaway diagrams where useful.

### Defaults

- narrative mode: `day-in-the-life`;
- map density: low;
- reconstruction density: medium;
- title style: direct experiential question.

---

## 8. `disaster-pandemic-survival`

Suitable for plagues, shipwrecks, fires, famines, failed expeditions, earthquakes, industrial disasters, and survival events.

### Narrative characteristics

- conditions before the event;
- triggering factors;
- timeline of escalation;
- human decisions;
- individual and systemic consequences;
- survival and response;
- later reforms;
- avoid deterministic hindsight and fabricated last moments.

### Visual characteristics

- event timelines;
- route maps;
- structural diagrams;
- weather or environmental context;
- casualty figures only when responsibly sourced;
- restrained reconstruction.

### Defaults

- narrative mode: `chronological`;
- tension curve: high;
- factual caution: high;
- title style: event plus critical decisions or consequences.

---

## 9. `technology-trade-transformation`

Suitable for inventions, infrastructure, trade networks, industrialization, transport, communications, and economic systems.

### Narrative characteristics

- precursor technologies;
- problem solved;
- key actors and institutions;
- adoption path;
- economic effects;
- labor and social consequences;
- unintended outcomes;
- global diffusion.

### Visual characteristics

- process diagrams;
- engineering cutaways;
- trade maps;
- before/after comparisons;
- timelines;
- system-flow animations.

### Defaults

- narrative mode: `chronological`;
- diagram density: high;
- biography density: medium;
- title style: invention/system plus world-changing effect.

---

## 10. `dark-strange-history`

Suitable for witch trials, historical crimes, unusual epidemics, bizarre laws, cults, unexplained incidents, and forgotten events.

### Narrative characteristics

- strong but honest hook;
- documented social context;
- evidence versus folklore;
- victims and consequences;
- competing explanations;
- avoid exploitative or comedic treatment of suffering;
- do not turn legends into established facts.

### Visual characteristics

- atmospheric period scenes;
- documents;
- maps;
- timelines;
- restrained darkness;
- no horror-style visual distortion that misrepresents evidence.

### Defaults

- narrative mode: `investigative`;
- atmosphere: dark but documentary;
- uncertainty markers: mandatory when applicable;
- title style: strange event plus factual question.

---

# Phase 4 — Format presets

Implement or extend shared format presets without duplicating common configuration.

## `short`

Target:

- approximately 45–75 seconds;
- one central question;
- one clear answer or unresolved conclusion;
- 5–9 visual beats;
- immediate hook;
- no broad topic summaries;
- no unsupported simplification;
- optional call-to-action pointing to a full documentary.

Suggested structure:

1. hook;
2. context;
3. two or three decisive facts;
4. twist, consequence, or uncertainty;
5. concise ending.

## `standard`

Target:

- approximately 6–10 minutes;
- 800–1,600 words, adapted to the repository's measured narration speed;
- 8–16 sections or meaningful visual sequences;
- clear thesis;
- multiple evidence-backed turning points;
- chapters where publishing supports them.

Suggested structure:

1. cold open;
2. historical question;
3. context;
4. development;
5. turning point;
6. outcome;
7. legacy;
8. sourced conclusion.

## `long`

Target:

- approximately 15–25 minutes;
- length derived from voice speed rather than a fixed word count;
- deeper context;
- multiple acts;
- maps, timelines, and source-aware argumentation;
- section-level validation;
- chapter metadata required.

Suggested structure:

1. cinematic cold open;
2. thesis and scope;
3. background;
4. act I;
5. act II;
6. act III;
7. competing interpretations;
8. consequences;
9. legacy;
10. conclusion and source note.

Preserve the current approved voice speed for any existing educational preset. History must have its own explicit audio pacing defaults and must not modify unrelated genre defaults.

---

# Phase 5 — Historical evidence and factuality policy

History content must use a stricter evidence model than fictional genres.

Implement a reusable `HistoryEvidencePolicy` integrated with existing fact, citation, validation, and prompt infrastructure.

## Required rules

1. Do not fabricate:
   - quotations;
   - dates;
   - casualty figures;
   - troop strengths;
   - names;
   - documents;
   - archaeological findings;
   - motivations;
   - last words;
   - private conversations.

2. Distinguish:
   - established fact;
   - strong scholarly consensus;
   - reasonable inference;
   - disputed interpretation;
   - legend or later tradition;
   - unknown.

3. Every episode manifest should be able to store:
   - source references;
   - claim-to-source associations where supported;
   - confidence;
   - dispute status;
   - retrieval date where external research is used;
   - warnings generated by validators.

4. Require stronger corroboration for:
   - precise numbers;
   - controversial political claims;
   - atrocity claims;
   - disputed causes;
   - sensational allegations;
   - quotations;
   - claims about intent or motivation.

5. Prefer primary and scholarly sources when available.

6. Allow reputable secondary sources for general context.

7. Reject low-quality evidence as the sole basis for consequential claims.

8. For unresolved history, ensure the final script preserves uncertainty rather than forcing a definitive ending.

9. Never cite sources that were not actually consulted by the research stage.

10. Never render invented archival footage as authentic footage. Generated reconstructions must be identifiable in metadata and, where the presentation could mislead, visually or verbally labeled as reconstruction.

## Claim model

Reuse or extend the existing canonical fact model. A suitable conceptual shape is:

```ts
interface HistoricalClaim {
  readonly id: string;
  readonly statement: string;
  readonly classification:
    | "established"
    | "consensus"
    | "inference"
    | "disputed"
    | "legend"
    | "unknown";
  readonly confidence: number;
  readonly sourceIds: readonly string[];
  readonly requiresCorroboration: boolean;
  readonly sensitivityTags: readonly string[];
}
```

Do not add this exact interface if an equivalent shared structure exists. Extend the shared structure instead.

## Script validator requirements

Add deterministic and model-assisted validation where the repository supports it.

Validate:

- date consistency;
- chronology;
- person and place consistency;
- title/script agreement;
- unsupported certainty;
- fabricated quotations;
- conflicting numbers;
- modern borders or terminology used anachronistically;
- unsupported causal claims;
- unmarked speculation;
- dehumanizing or propagandistic framing;
- excessive presentism;
- missing consequences for affected civilian populations where materially relevant;
- duplicated sections;
- excessive exposition;
- weak opening;
- conclusion unsupported by the body.

Repairs must preserve verified facts, exact source-backed quotations, approved terminology, and the intended conclusion classification.

---

# Phase 6 — Research workflow integration

Integrate history research into the existing canonical planning pipeline.

A recommended flow is:

```text
topic input
  -> research scope definition
  -> source collection
  -> source quality assessment
  -> claim extraction
  -> contradiction detection
  -> chronology normalization
  -> documentary thesis
  -> episode outline
  -> script
  -> historical validation
  -> localization
  -> visual planning
  -> audio
  -> rendering
  -> metadata
  -> publishing
```

## Research brief

The episode should generate a typed research brief containing:

- central question;
- time range;
- geographic scope;
- important actors;
- required maps or timelines;
- likely disputed claims;
- terminology;
- sensitivity concerns;
- required source categories;
- exclusions;
- target audience;
- target duration.

## Source quality

Add a source-quality classification compatible with current repository patterns.

Suggested levels:

- primary;
- peer-reviewed/scholarly;
- museum/archive/university;
- reputable reference;
- reputable journalism;
- specialist secondary;
- low-confidence/general web;
- prohibited/unreliable.

Do not make research dependent on a single provider. Use the repository's provider abstractions.

---

# Phase 7 — Script and narrative prompts

Create history-specific prompt templates through the canonical prompt system.

Do not construct a single enormous prompt containing all presets. Compose bounded prompt modules based on:

- selected preset;
- format;
- locale;
- audience level;
- evidence policy;
- visual capabilities;
- available research;
- sensitivity tags.

## Required prompt modules

Implement modules for:

- research brief;
- source assessment;
- claim extraction;
- chronology;
- thesis;
- outline;
- script;
- short script;
- hook generation;
- section repair;
- factuality audit;
- localization;
- visual beat planning;
- map planning;
- timeline planning;
- thumbnail concepts;
- YouTube metadata;
- chapter generation.

## Script quality requirements

All generated scripts should:

- open with a concrete historical tension, event, decision, contradiction, or mystery;
- define the scope early;
- avoid empty cinematic language;
- avoid repeated rhetorical questions;
- maintain chronology unless a deliberate nonlinear structure is selected;
- use transitions that explain causality and time;
- vary sentence length for natural narration;
- avoid invented sensory detail;
- avoid treating legends as facts;
- explain specialist terms briefly;
- use human stories without sacrificing structural analysis;
- end with a meaningful consequence, legacy, or unresolved question;
- not add generic engagement prompts inside the documentary unless enabled by publishing configuration.

---

# Phase 8 — Localization

Use the existing localization pipeline.

History localization must preserve:

- names;
- historical titles;
- dates;
- quotations;
- source references;
- period-specific terminology;
- uncertainty classification;
- distinctions between empire, state, nation, ethnicity, religion, and dynasty;
- exact final lines where locked by the episode contract.

## Localization rules

- Prefer accepted target-language historical names where standard.
- Preserve original names in parentheses when useful.
- Do not translate archival quotations through an invented wording.
- Mark translated quotations as translations where the source workflow supports this.
- Avoid silently changing units, calendars, or date systems.
- Handle BCE/CE and local equivalents consistently.
- Retain source-to-claim associations across localized scripts.
- Validate that localization did not introduce stronger certainty than the canonical script.

Support all languages currently supported by the repository.

---

# Phase 9 — Audio presets

Integrate with the existing common TTS provider interface.

History must work with:

- OpenAI TTS where configured;
- ElevenLabs where configured;
- cloned voices where configured and authorized;
- future providers through the common interface.

Do not hard-code a provider.

## Required audio presets

Add typed history audio presets such as:

### `documentary-neutral`

- calm;
- authoritative;
- measured;
- low dramatization;
- suitable default for most topics.

### `documentary-epic`

- broader dynamic range;
- slightly slower on major turning points;
- suitable for wars, empires, and collapse;
- never theatrical enough to undermine credibility.

### `documentary-investigative`

- controlled suspense;
- precise pauses;
- suitable for archaeology and unresolved mysteries.

### `documentary-intimate`

- warmer and more human;
- suitable for biography and everyday-life history.

Expose:

- provider;
- voice ID;
- speaking rate;
- stability/style controls where supported;
- pronunciation overrides;
- locale;
- chapter pauses;
- quotation handling;
- fallback behavior.

Use one default cloned voice across languages only if the existing per-genre voice configuration requests it. Do not assume a cloned voice exists.

## Pronunciation lexicon

Support a per-episode pronunciation lexicon for:

- historical names;
- places;
- dynasties;
- Latin/Greek terms;
- non-English names;
- acronyms;
- dates;
- regnal numbers.

Persist pronunciation decisions in episode artifacts so reruns remain deterministic.

---

# Phase 10 — Visual presets

Implement history-specific visual configuration using the canonical image and composition systems.

## General visual principles

- documentary credibility before spectacle;
- historically plausible clothing, architecture, tools, weapons, insignia, geography, and material culture;
- avoid anachronisms;
- avoid modern cinematic clichés where unsupported;
- do not depict generated scenes as authentic archival evidence;
- maintain visual continuity for recurring people, places, uniforms, and objects;
- reuse reference-image and story-bible mechanisms where applicable;
- store visual provenance and reconstruction status.

## Required visual modes

Support combinations of:

- cinematic reconstruction;
- archival/documentary;
- illustrated manuscript;
- engraved/painted period style;
- artifact and museum object;
- animated map;
- timeline;
- family tree;
- process diagram;
- architectural reconstruction;
- location/environment;
- newspaper/document;
- portrait;
- statistical or comparative graphic.

## Preset defaults

### Military

- muted documentary palette;
- map-first explanation;
- terrain-aware scenes;
- accurate uniforms and formations;
- low gore;
- no heroic glorification by default.

### Civilizations

- monumental architecture;
- geographic context;
- trade and settlement maps;
- artifact detail;
- atmospheric but evidence-aware reconstructions.

### Biography

- portrait continuity;
- location chronology;
- documents and letters;
- relationships and decisions.

### Archaeology

- excavation realism;
- artifact close-ups;
- layered reconstruction;
- evidence labels;
- restrained mystery atmosphere.

### Everyday life

- practical environments;
- tools and routines;
- class- and region-specific context;
- clear material-culture details.

### Dark history

- subdued contrast;
- period realism;
- no supernatural imagery unless the episode is explicitly discussing belief or legend;
- victim-sensitive framing.

## Image prompt contract

History image prompts should include structured fields for:

- year or approximate period;
- location;
- culture/polity;
- subject;
- social role;
- clothing;
- architecture;
- objects;
- weather/time;
- visual mode;
- camera framing;
- continuity references;
- prohibited anachronisms;
- reconstruction label;
- sensitivity constraints.

Use a schema rather than concatenating arbitrary prompt strings wherever the current architecture permits.

---

# Phase 11 — Maps, timelines, and diagrams

Where the renderer supports these elements, add history-specific planning and validation.

## Maps

Support:

- campaign maps;
- political boundaries;
- trade routes;
- migration routes;
- expedition routes;
- territorial change;
- site plans.

Map plans should contain:

- date or phase;
- geographic extent;
- entities;
- routes;
- labels;
- uncertainty;
- source references;
- animation instructions;
- accessibility description.

Do not draw modern national borders as historical borders unless explicitly needed for orientation and visually distinguished.

## Timelines

Support:

- episode-level timeline;
- life timeline;
- campaign phases;
- dynasty succession;
- invention/adoption;
- disaster escalation.

## Relationship diagrams

Support:

- royal family trees;
- alliances;
- rivalries;
- chains of command;
- institutional relationships.

## Diagrams

Support:

- fortifications;
- ships;
- industrial systems;
- trade flows;
- weapon or technology mechanisms;
- city layouts.

All diagrams must be derived from validated episode data rather than improvised during final rendering.

---

# Phase 12 — Titles, thumbnails, and metadata

Integrate with the canonical publishing metadata pipeline.

## Title presets

Generate multiple title candidates classified by style:

- explanatory;
- high-curiosity;
- event-driven;
- character-driven;
- consequence-driven;
- mystery-driven.

Title rules:

- no fabricated certainty;
- no false “hidden truth” framing;
- no implication that historians conceal information without evidence;
- no unsupported superlatives;
- avoid generic titles such as `The Complete History of...` unless scope genuinely supports them;
- preserve names and dates accurately;
- optimize for clarity before sensationalism.

## Thumbnail presets

Generate structured thumbnail concepts with:

- one primary subject;
- one secondary contextual element;
- high visual hierarchy;
- minimal text;
- historically plausible imagery;
- no misleading modern photographs;
- no fake archival labels;
- topic-specific palette and composition;
- mobile readability.

Suggested thumbnail text limit: 0–4 words.

## Description

Descriptions should include:

- concise episode summary;
- scope and central question;
- chapter timestamps where available;
- source note or bibliography link/path where supported;
- reconstruction disclosure where relevant;
- language and accessibility metadata;
- no invented credentials or source claims.

## Tags and categories

Add a controlled taxonomy:

- period;
- region;
- civilization/state;
- event type;
- documentary preset;
- major actors;
- themes;
- format;
- language.

Avoid tag stuffing.

---

# Phase 13 — Initial topic catalog

Seed a typed, optional topic catalog or fixture containing the following 50 ideas.

Do not make these hard-coded production dependencies. They should be discoverable starter topics, examples, demo fixtures, or development seed data consistent with repository conventions.

## Military history

1. Stalingrad: The Battle That Broke Hitler's Army
2. Thermopylae: What Really Happened to the 300 Spartans?
3. D-Day: The First 24 Hours of the Normandy Invasion
4. The Mongol War Machine: How Genghis Khan Conquered an Empire
5. Napoleon's Invasion of Russia: The Destruction of the Grande Armée

## Ancient civilizations and collapse

6. The Bronze Age Collapse: Why an Entire World Disappeared
7. The Maya Collapse: Drought, War, and the Abandonment of the Cities
8. The Fall of the Western Roman Empire
9. Sumer: The Rise and Fall of the World's First Cities
10. The Lost Indus Valley Civilization

## Empires and dynasties

11. The Ottoman Empire: From Frontier Kingdom to Superpower
12. The Byzantine Empire: How Rome Survived for Another Thousand Years
13. The British Empire: How a Small Island Ruled a Quarter of the World
14. The Qin Dynasty: The Brutal Creation of Imperial China
15. The Aztec Empire: Power, Sacrifice, and the Coming of Cortés

## Historical biographies

16. Alexander the Great: Conqueror of the Known World
17. Cleopatra: The Last Pharaoh Beyond the Legend
18. Genghis Khan: From Exile to Emperor
19. Joan of Arc: Warrior, Heretic, and Saint
20. Napoleon Bonaparte: Genius, Emperor, and Exile

## Archaeology and mysteries

21. Tutankhamun: The Discovery and Curse of the Pharaoh's Tomb
22. Göbekli Tepe: The Temple That Rewrote Prehistory
23. The Search for Troy: Myth, Archaeology, and War
24. The Lost Franklin Expedition: Death in the Arctic
25. The Mystery of the Roanoke Colony

## World wars and geopolitics

26. Operation Barbarossa: Hitler's Fatal Invasion of the Soviet Union
27. The Pacific War: From Pearl Harbor to Hiroshima
28. The Rise and Fall of Nazi Germany
29. The Cuban Missile Crisis: Thirteen Days from Nuclear War
30. The Berlin Wall: The City Divided by the Cold War

## Royal families and court intrigue

31. The Tudors: Power, Marriage, and Execution
32. The Romanovs: The Final Days of Imperial Russia
33. The Habsburgs: The Dynasty That Married Its Way Across Europe
34. The Borgias: Crime, Religion, and Power in Renaissance Rome
35. Versailles: Secrets and Scandals of the French Court

## Everyday life

36. A Day in the Life of a Medieval Peasant
37. What Life Was Really Like for a Roman Legionary
38. Growing Up in Victorian London
39. The Hidden Lives of Women in the Viking Age
40. Food, Hygiene, and Disease in a Medieval City

## Technology, trade, and transformation

41. The Silk Road: The Network That Connected the Ancient World
42. The Printing Press: The Invention That Broke Europe
43. Gunpowder: How One Discovery Changed Warfare
44. The Industrial Revolution: How Machines Remade Human Life
45. The Railway Revolution: How Trains Created the Modern World

## Dark, strange, and catastrophic history

46. The Black Death: How the Plague Transformed Europe
47. The Salem Witch Trials: Fear, Accusation, and Execution
48. Jack the Ripper: Inside Victorian London's Most Famous Mystery
49. The Dancing Plague of 1518
50. The Titanic: Decisions That Turned Disaster into Catastrophe

For each seed topic, include:

- stable ID;
- title;
- recommended preset;
- period;
- region;
- suggested format;
- sensitivity tags;
- initial research questions;
- visual feature recommendations;
- map/timeline requirements.

---

# Phase 14 — CLI integration

Extend the canonical CLI rather than creating history-only scripts.

The exact command structure must follow repository conventions. Equivalent expected capabilities include:

```bash
mediaforge genre list
mediaforge genre describe history
mediaforge history presets
mediaforge episode create --genre history --preset civilization-rise-fall
mediaforge research run <episode>
mediaforge script generate <episode>
mediaforge episode validate <episode>
mediaforge visuals plan <episode>
mediaforge audio generate <episode>
mediaforge video render <episode>
mediaforge publish prepare <episode>
mediaforge workflow status <episode>
mediaforge workflow next <episode>
```

If the CLI is organized differently, integrate equivalent behavior into the existing flow-based command model.

## CLI requirements

- self-explaining help text;
- typed enum validation;
- actionable errors;
- dry-run support where existing commands support it;
- resumable stages;
- no duplicate path or filename logic;
- workflow log entries for every stage;
- exact executable command recorded in workflow history;
- exit code, timing, provider, model, artifact paths, warnings, and failure details recorded;
- deterministic `next` recommendations based on actual artifact state.

---

# Phase 15 — API and frontend integration

If the repository contains the API implementation:

- expose history through the canonical genre endpoints;
- update OpenAPI/JSON Schema contracts;
- validate presets server-side;
- preserve versioning;
- add API tests;
- expose workflow stages and validation findings;
- do not leak provider secrets or internal prompts.

If the repository contains the frontend:

- add History to genre selection;
- expose preset cards with concise descriptions;
- support format and audience selection;
- expose source/factuality status;
- display disputed-claim warnings;
- display workflow progress;
- use existing design system components;
- do not create a separate visual language for History.

Do not block backend completion if frontend or API modules are absent.

---

# Phase 16 — Episode artifacts and workflow state

Use canonical artifact paths and manifests.

A history episode should be able to persist:

- input topic;
- research brief;
- source inventory;
- source assessments;
- claims;
- chronology;
- contradictions;
- outline;
- canonical script;
- localized scripts;
- pronunciation lexicon;
- visual plan;
- map plan;
- timeline plan;
- image prompts;
- generated images;
- audio;
- subtitles if the shared pipeline creates them;
- video;
- thumbnail;
- publishing metadata;
- validation reports;
- workflow log;
- provenance and provider metadata.

Do not introduce a second episode directory layout.

Workflow state must remain resumable after partial failure.

A failed localized audio generation must not invalidate verified research or canonical script artifacts.

---

# Phase 17 — Observability

Instrument history-specific operations through existing logging, tracing, and metrics facilities.

Add dimensions only where cardinality is controlled.

Useful metrics include:

- research duration;
- sources evaluated;
- sources rejected;
- claims extracted;
- disputed claims;
- unsupported claims detected;
- chronology conflicts;
- script repair count;
- localization validation failures;
- image anachronism warnings;
- map/timeline generation failures;
- TTS duration and cost;
- image generation count and cost;
- render duration;
- publish readiness failures.

Logs must not expose:

- API keys;
- full confidential prompts where prohibited;
- private cloned-voice credentials;
- copyrighted source text beyond allowed storage policy;
- sensitive operator data.

---

# Phase 18 — Security, safety, and compliance

Implement conservative handling for:

- extremist symbols and propaganda;
- atrocities;
- genocide;
- graphic violence;
- colonial violence;
- slavery;
- religious conflict;
- racial or ethnic persecution;
- disputed national narratives;
- living political sensitivities;
- copyrighted archival material;
- voice-clone consent and authorization.

Rules:

- historical explanation is allowed;
- glorification and recruitment framing are not;
- generated extremist symbols should appear only when historically necessary and contextually framed;
- graphic imagery is disabled by default;
- generated reconstructions must not falsely imply authenticity;
- cloned voices must use existing consent and authorization controls;
- publishing metadata should support age/content warnings where required;
- do not silently download or reuse copyrighted media outside existing licensed asset policies.

---

# Phase 19 — Testing

Add tests at the appropriate repository layers.

## Unit tests

Cover:

- genre registration;
- preset validation;
- default resolution;
- period and scope validation;
- evidence classification;
- claim validation;
- chronology ordering;
- disputed-claim preservation;
- prompt module selection;
- format defaults;
- audio preset resolution;
- visual prompt schema;
- metadata taxonomy;
- workflow transition behavior.

## Contract/schema tests

Cover:

- config schema;
- episode manifest;
- source records;
- claims;
- research brief;
- visual plan;
- map plan;
- timeline plan;
- API/OpenAPI schemas if present.

## Integration tests

Cover at least:

1. short `dark-strange-history` episode;
2. standard `civilization-rise-fall` episode;
3. standard `military-campaign` episode with map plan;
4. long `historical-biography` episode;
5. multilingual localization;
6. provider fallback;
7. interrupted workflow resume;
8. validator detection of unsupported certainty;
9. preservation of disputed interpretations;
10. failure isolation between stages.

Use fixtures and mocked providers where practical. Do not call paid external APIs in ordinary test suites.

## Regression tests

Verify existing genres retain unchanged behavior unless an intentional shared improvement is documented.

---

# Phase 20 — Documentation

Add or update:

- genre overview;
- preset reference;
- configuration examples;
- CLI examples;
- API examples if present;
- workflow description;
- evidence policy;
- source quality rules;
- reconstruction disclosure rules;
- provider configuration;
- cloned-voice configuration;
- troubleshooting;
- test instructions;
- migration notes;
- operator decisions.

Provide at least one complete example configuration for each documentary format and several representative presets.

---

# Suggested implementation decomposition

Use multiple agents only with explicit ownership boundaries.

## Agent A — Architecture and schemas

Own:

- repository audit;
- genre registration;
- TypeScript contracts;
- schemas;
- defaults;
- manifests;
- migration strategy.

Do not edit prompt content owned by Agent B unless coordinated.

## Agent B — Research, prompts, and validation

Own:

- research workflow;
- source assessment;
- claims;
- chronology;
- prompt modules;
- historical validators;
- repair prompts.

## Agent C — Visuals, audio, and composition presets

Own:

- visual preset configuration;
- image prompt schema;
- maps/timelines/diagrams;
- audio presets;
- pronunciation lexicon;
- renderer integration.

## Agent D — CLI, workflow, API/frontend, documentation, and tests

Own:

- CLI registration;
- workflow-state integration;
- API/frontend surfaces where present;
- documentation;
- integration tests;
- release evidence.

Before parallel edits, publish a file ownership map. Avoid concurrent edits to shared registries and barrel exports. Merge shared integration points serially.

---

# Recommended implementation order

1. Audit and identify canonical extension points.
2. Add typed genre and preset contracts.
3. Add schemas and defaults.
4. Add episode/research evidence structures.
5. Add prompt modules.
6. Add validators.
7. Add audio and visual presets.
8. Add map/timeline planning.
9. Add topic fixtures.
10. Integrate CLI.
11. Integrate API/frontend where present.
12. Add tests.
13. Add documentation.
14. Run release gates.
15. Produce final implementation report.

---

# Acceptance criteria

The work is complete only when all applicable criteria pass.

## Architecture

- [ ] `history` is registered through the canonical genre system.
- [ ] No duplicate history pipeline exists.
- [ ] Shared provider interfaces are reused.
- [ ] Shared artifact and workflow paths are reused.
- [ ] Types and schemas reject invalid preset/config combinations.
- [ ] Existing genres remain backward compatible.

## Presets

- [ ] All ten documentary presets are implemented.
- [ ] `short`, `standard`, and `long` formats are supported.
- [ ] Presets affect narrative, visuals, audio, and metadata.
- [ ] Defaults can be overridden through canonical configuration.

## Factuality

- [ ] Source inventory is persisted.
- [ ] Claims support confidence and dispute classification.
- [ ] Unsupported certainty is detected.
- [ ] Fabricated quotations are prohibited.
- [ ] Chronology is validated.
- [ ] Speculation remains labeled.
- [ ] Reconstructions are distinguishable from authentic archival material.

## Media

- [ ] History audio presets work with the common provider interface.
- [ ] Pronunciation overrides are persisted.
- [ ] Visual prompts include period and anti-anachronism constraints.
- [ ] Map and timeline planning works where supported.
- [ ] Thumbnail and metadata generation are preset-aware.

## Workflow

- [ ] CLI/API/frontend surfaces expose History where present.
- [ ] Workflow status and next-step computation work.
- [ ] Interrupted runs resume safely.
- [ ] Stage failures are isolated.
- [ ] Logs and metrics are structured and safe.

## Quality

- [ ] Unit tests pass.
- [ ] Integration tests pass.
- [ ] Schema/contract tests pass.
- [ ] Regression tests for existing genres pass.
- [ ] Lint passes.
- [ ] Type checking passes.
- [ ] Build passes.
- [ ] Relevant release gates pass.
- [ ] Documentation is complete.

---

# Validation commands

Derive the exact commands from the repository.

Run all applicable checks, typically including equivalents of:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm test:integration
pnpm test:e2e
pnpm build
pnpm validate
```

Also run focused tests for every modified package before repository-wide checks.

Do not claim a check passed unless it was executed successfully.

---

# Final report

At completion, provide:

1. concise implementation summary;
2. architecture and canonical extension points used;
3. files added and modified;
4. presets implemented;
5. factuality and evidence controls;
6. CLI/API/frontend changes;
7. tests and commands executed with results;
8. backward-compatibility assessment;
9. known limitations;
10. unresolved operator decisions;
11. recommended next safe implementation step;
12. example commands to generate the first History episode.

Also provide one recommended pilot execution using the imported episode sourced from:

```text
content-packs/youtube-history-10-video-story-pack/01-bronze-age-collapse.md
```

The pilot configuration must use:

- topic: `The Bronze Age Collapse`;
- preset: `civilization-rise-fall`;
- format: `standard`;
- audience: `general`;
- narrative mode: `rise-and-fall`;
- audio: `documentary-neutral`;
- maps: enabled;
- timeline: enabled;
- multilingual output: use the repository's currently configured languages.

Show the exact commands for:

1. inspecting the pack;
2. validating the pack in strict mode;
3. performing a dry-run import;
4. importing all ten episodes;
5. checking the Bronze Age episode workflow status;
6. running factual validation;
7. generating the next safe artifacts;
8. confirming publish readiness remains false until all required gates pass.


---

# Immediate execution directive

Begin by verifying that:

```text
content-packs/youtube-history-10-video-story-pack/
```

exists at repository root.

If it exists:

1. inventory it;
2. calculate checksums;
3. inspect current genre and content import architecture;
4. publish a multi-agent file ownership map;
5. implement the canonical History genre;
6. implement the reusable content-pack importer;
7. import the ten scripts through the new workflow;
8. run all applicable validations;
9. leave every episode non-publishable until factual and media gates are complete;
10. produce the final report and exact next commands.

If it does not exist:

- continue implementing the generic History genre and importer;
- add a clear preflight error and documentation for the expected path;
- use repository test fixtures to validate the importer;
- do not fabricate imported production episodes;
- report the missing pack as a blocking input for the pack-import portion only.

Do not finish with a plan-only response. Implement the code, tests, schemas, CLI integration, documentation, and migration-safe content import.
