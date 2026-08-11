# Codex Prompt — Deep Code Analysis & Architecture Review Pack

Take the role of a **Principal Software Architect, Staff+ TypeScript Platform Engineer, Production Reliability Engineer, AI/Media Pipeline Architect, Static Analysis Engineer, and Architecture Forensics Auditor**.

You are working inside my existing YouTube/content-production TypeScript monorepo.

Your task is to implement a reusable system that generates a **self-contained, source-grounded deep code-analysis and architecture-review pack** from the repository.

The resulting pack will later be uploaded to ChatGPT so I can perform detailed architecture audits and ask follow-up questions without needing to provide the complete repository.

---

# 1. Primary Goal

Implement a reusable architecture-review-pack generator that allows a future reviewer to:

- reconstruct the actual architecture;
- reconstruct the actual runtime production pipelines;
- understand all major modules and packages;
- trace execution from CLI entrypoints to provider calls and persisted artifacts;
- understand quality gates and readiness logic;
- understand remediation and escalation flows;
- identify legacy commands and compatibility paths;
- identify versioned pipeline implementations;
- identify genre-specific behavior;
- identify locale-specific behavior;
- identify provider-specific behavior;
- understand configuration precedence;
- understand feature flags;
- inspect type-safety weaknesses;
- inspect production reliability;
- inspect caching and reuse behavior;
- inspect concurrency and idempotency;
- inspect observability and error handling;
- inspect tests as behavioral evidence;
- identify architectural drift between documentation, tests, and implementation;
- investigate individual source files and call sites;
- ask precise architectural questions after uploading the pack to ChatGPT.

The review pack must contain enough **actual source evidence** that another senior engineer can verify architectural claims independently.

Do not create a superficial documentation export.

Do not assume existing reports, architecture documents, automated PASS results, gate statuses, manifests, metrics, or comments are correct.

Treat them as claims that must be verified against actual implementation.

---

# 2. Architectural Direction

We already have AI/content-pack concepts and reusable artifact infrastructure in the repository.

Prefer extending existing generic artifact-pack infrastructure where appropriate.

However:

**Do not model an architecture review pack as a video episode/content pack.**

Introduce a distinct domain concept such as:

```ts
ArchitectureReviewPack
```

or:

```ts
CodeAuditPack
```

The architecture-review system may reuse generic infrastructure for:

- manifests;
- hashes;
- deterministic serialization;
- ZIP creation;
- artifact validation;
- file selection;
- file indexing;
- redaction;
- safe copying.

Keep responsibilities separated:

```text
content production
architecture inspection
static analysis
source selection
pack serialization
pack validation
CLI orchestration
```

Preferred dependency direction:

```text
                   ┌──────────────────────────┐
                   │    Artifact Pack Core    │
                   │                          │
                   │ manifest / hashes / ZIP │
                   │ index / validation      │
                   │ selection / redaction   │
                   └────────────┬─────────────┘
                                │
              ┌─────────────────┴─────────────────┐
              │                                   │
     ┌────────▼────────┐                 ┌────────▼─────────┐
     │ AI Content Pack │                 │ Architecture     │
     │                 │                 │ Review Pack      │
     │ episodes        │                 │                  │
     │ scripts         │                 │ source code      │
     │ scenes          │                 │ dependency graph │
     │ media           │                 │ flows / indexes  │
     └─────────────────┘                 └──────────────────┘
```

Avoid:

```text
architecture review pack
        ↓
video content-pack domain semantics
```

If generic functionality is currently trapped inside the content-pack domain, extract only the smallest clean reusable abstraction required.

Do not perform a broad unrelated refactor.

---

# 3. Primary CLI

Implement a reusable CLI command following the repository's existing composition root and command conventions.

A reasonable command shape is:

```bash
pnpm youtube audit build-review-pack
```

Support repository scope:

```bash
pnpm youtube audit build-review-pack \
  --scope repository \
  --output ./artifacts/review-packs \
  --zip
```

Future scoped packs should be possible:

```bash
pnpm youtube audit build-review-pack --scope image
pnpm youtube audit build-review-pack --scope speech
pnpm youtube audit build-review-pack --scope localization
pnpm youtube audit build-review-pack --scope publishing
pnpm youtube audit build-review-pack --scope qa
pnpm youtube audit build-review-pack --scope episode-pipeline
pnpm youtube audit build-review-pack --scope repository
```

For this task, repository scope is the primary requirement.

Do not create a parallel CLI framework if the repository already has a CLI composition root.

---

# 4. Required Pack Structure

Generate an unpacked directory similar to:

```text
artifacts/review-packs/
└── youtube-architecture-review-<timestamp>/
    ├── README.md
    ├── REVIEW-INSTRUCTIONS.md
    ├── COMPLETENESS.md
    ├── manifest.json
    ├── repository-summary.md
    │
    ├── architecture/
    │   ├── current-architecture.md
    │   ├── contracts.md
    │   ├── artifact-lifecycle.md
    │   ├── concurrency.md
    │   ├── cache-and-reuse.md
    │   ├── type-safety.md
    │   ├── legacy-and-deprecation.md
    │   ├── execution-paths.md
    │   ├── pipeline-versions.md
    │   ├── behavioral-surface.md
    │   ├── execution-variations.md
    │   ├── workflow-state-machine.md
    │   ├── genre-variation-matrix.md
    │   ├── locale-variation-matrix.md
    │   ├── provider-matrix.md
    │   ├── feature-flags.md
    │   ├── uncertainties.md
    │   ├── findings.md
    │   └── performance.md
    │
    ├── flows/
    │   ├── end-to-end-production.md
    │   ├── image-generation.md
    │   ├── speech-generation.md
    │   └── localization.md
    │
    ├── quality/
    │   ├── gate-inventory.md
    │   ├── gate-matrix.md
    │   ├── gate-dependencies.md
    │   ├── remediation-flow.md
    │   └── readiness-state-machine.md
    │
    ├── dependency-analysis/
    │   ├── module-graph.md
    │   └── module-graph.json
    │
    ├── configuration/
    │   ├── runtime-config.md
    │   ├── config-precedence.md
    │   └── ai-models.md
    │
    ├── testing/
    │   ├── test-architecture.md
    │   └── behavioral-contracts.md
    │
    ├── operations/
    │   ├── error-handling.md
    │   ├── observability.md
    │   ├── reliability.md
    │   └── security.md
    │
    ├── indexes/
    │   ├── packages.json
    │   ├── source-index.json
    │   ├── symbols.md
    │   ├── entrypoints.json
    │   ├── cli-commands.json
    │   ├── cli-options.json
    │   ├── feature-flags.json
    │   ├── quality-gates.json
    │   ├── execution-paths.json
    │   ├── pipeline-versions.json
    │   ├── config-values.json
    │   └── cli-help/
    │
    └── source/
        └── <repository-relative source paths>
```

Also create:

```text
youtube-architecture-review-<timestamp>.zip
```

Exact names may follow existing repository conventions.

---

# 5. README

Create:

```text
README.md
```

Include:

- repository name;
- repository path;
- commit SHA if available;
- branch if available;
- dirty-working-tree status if available;
- generation timestamp;
- generator version;
- requested scope;
- included source count;
- excluded file count;
- truncation count;
- total pack size;
- ZIP size;
- whether generated artifacts were included;
- whether secrets were scanned/redacted;
- important limitations.

Keep this concise.

---

# 6. Review Instructions

Create:

```text
REVIEW-INSTRUCTIONS.md
```

Tell a future ChatGPT or human reviewer to:

- treat all generated summaries as secondary evidence;
- prioritize actual source files;
- verify claims against implementation;
- inspect tests where behavior is ambiguous;
- distinguish intended architecture from actual architecture;
- distinguish reachable code from merely existing code;
- distinguish legacy compatibility from active production paths;
- identify configuration-dependent behavior;
- identify dynamically dispatched paths;
- mark unsupported conclusions as uncertain;
- never assume an automated PASS means the underlying implementation is correct.

---

# 7. Repository Inventory

Generate:

```text
repository-summary.md
```

Include:

- repository structure;
- workspaces;
- packages;
- applications;
- internal libraries;
- scripts;
- build tooling;
- test tooling;
- major runtime components;
- orchestration components;
- media processing;
- AI integrations;
- providers;
- persistence/artifact storage;
- publishing integrations;
- CI/CD entrypoints;
- developer utilities.

Include a bounded repository tree.

Exclude by default:

```text
node_modules
dist
build
coverage
.cache
.git
temporary media
generated videos
generated audio
generated images
package-manager stores
large transient caches
```

unless directly necessary as architectural evidence.

---

# 8. Package Inventory

Generate:

```text
indexes/packages.json
architecture/packages.md
```

For every relevant package capture where possible:

```ts
interface PackageInventoryEntry {
  name: string;
  path: string;
  packageType?: string;
  dependencies: string[];
  devDependencies?: string[];
  internalDependencies: string[];
  entrypoints: string[];
  scripts: Record<string, string>;
  tsconfigs?: string[];
}
```

---

# 9. Actual Source Inclusion

This requirement is critical.

The pack must include **actual source files**, not only summaries.

Copy selected architecture-relevant source under:

```text
source/
```

Preserve repository-relative paths.

For example:

```text
source/apps/youtube-cli/src/...
source/packages/image-generation/src/...
source/packages/speech/src/...
```

Prefer exact source over generated prose.

Do not flatten filenames.

---

# 10. Mandatory Implementation Areas

Every repository-level review pack MUST contain source evidence for these five areas if they exist:

## 10.1 Main image pipeline

Include enough implementation to reconstruct:

- image-generation orchestration;
- prompt input handling;
- provider selection;
- image-generation requests;
- model selection;
- cache/reuse;
- semantic hashes;
- asset reuse;
- retries;
- rate limiting;
- output validation;
- persistence;
- manifest updates;
- failure behavior;
- observability.

## 10.2 OpenAI image adapter

Include:

- adapter implementation;
- interfaces/ports;
- request types;
- response types;
- model configuration;
- request construction;
- provider options;
- retries;
- timeout behavior;
- error normalization;
- response parsing;
- file/output handling;
- usage/cost accounting if present;
- logging/observability.

## 10.3 CLI composition root

Include:

- process/bootstrap entrypoint;
- dependency construction;
- command registration;
- provider wiring;
- configuration loading;
- shutdown handling;
- error handling;
- process exit behavior;
- plugin/registry wiring if applicable.

## 10.4 YouTube upload entry

Include:

- upload command/entrypoint;
- authentication;
- metadata construction;
- title/description/tag construction;
- localization handling;
- scheduling;
- privacy/state configuration;
- retry/failure handling;
- upload persistence/state tracking.

## 10.5 Speech legacy adapter

Include:

- legacy adapter implementation;
- interfaces;
- current callers;
- old callers if still reachable;
- compatibility behavior;
- provider mapping;
- configuration;
- relationship to current/new speech providers.

The review pack must allow a future reviewer to determine:

- why it still exists;
- what still depends on it;
- whether it is reachable;
- whether it can be removed safely;
- what migration remains.

---

# 11. End-to-End Production Reconstruction

Create:

```text
flows/end-to-end-production.md
```

Reconstruct the actual runtime pipeline from code.

Start with this only as a hypothesis:

```text
story/script
→ localization
→ speech/TTS
→ canonical timing
→ semantic analysis
→ scene planning
→ visual-event planning
→ image-prompt generation
→ image generation
→ asset reuse/cache
→ rendering
→ QA
→ approval/readiness
→ YouTube metadata
→ upload/publishing
```

Do not assume this exact order.

Determine actual stages, optional branches, skipped stages, alternate paths, and dependencies.

Use Mermaid diagrams where helpful.

Show:

- stage;
- implementation;
- input artifacts;
- output artifacts;
- quality gates;
- retries;
- remediation;
- provider calls;
- state transitions.

---

# 12. Image Generation Flow

Create:

```text
flows/image-generation.md
```

Show actual execution through:

```text
caller
→ orchestration
→ prompt preparation
→ cache lookup
→ asset reuse
→ provider abstraction
→ concrete provider
→ validation
→ storage
→ manifest/artifact update
```

Include alternate providers and legacy paths.

Identify:

- cache hit behavior;
- cache miss behavior;
- regeneration conditions;
- semantic-hash behavior;
- model/provider version impact on cache keys;
- failure/retry behavior.

---

# 13. Speech/TTS Flow

Create:

```text
flows/speech-generation.md
```

Include:

- current provider abstraction;
- OpenAI TTS if present;
- ElevenLabs if present;
- legacy speech adapter;
- provider selection;
- voice selection;
- model selection;
- localization;
- audio storage;
- canonical timing derivation;
- caching;
- retries;
- provider failures;
- fallbacks;
- fixtures/offline behavior.

---

# 14. Localization Architecture

Create:

```text
flows/localization.md
architecture/locale-variation-matrix.md
```

Analyze how multilingual content is represented and propagated.

Cover:

- master/source language;
- localized narration;
- localized metadata;
- localized visible text;
- subtitles/captions;
- shared visual assets;
- locale-specific image assets;
- locale-specific prompts;
- locale-specific scene plans;
- TTS voice/provider selection;
- WPM assumptions;
- actual audio duration;
- canonical timing;
- upload metadata.

Determine whether localization is:

```text
first-class domain data
```

or merely duplicated content/files/configuration.

Identify where locale changes actual runtime behavior rather than text only.

---

# 15. Module Dependency Graph

Generate:

```text
dependency-analysis/module-graph.md
dependency-analysis/module-graph.json
```

Inspect:

- package imports;
- workspace dependencies;
- TypeScript project references;
- dependency injection;
- factories;
- registries;
- command registrations.

Identify:

- central modules;
- highly coupled modules;
- circular dependencies;
- dependency direction violations;
- provider leakage into domain code;
- CLI leakage into domain packages;
- genre-specific coupling;
- shared infrastructure duplication;
- architecture boundary violations.

---

# 16. Entrypoint Inventory

Generate:

```text
indexes/entrypoints.json
```

Capture:

- CLI commands;
- command aliases;
- executable scripts;
- package.json scripts;
- API/server entrypoints;
- scheduled workflows;
- GitHub Actions;
- one-off migration scripts;
- repair scripts;
- debug utilities;
- operational scripts;
- upload/publish commands;
- test harness entrypoints.

---

# 17. Public Contracts

Create:

```text
architecture/contracts.md
```

Capture architecturally important:

```text
interfaces
ports
adapters
types
schemas
DTOs
events
artifact schemas
provider contracts
```

Prioritize boundaries between:

```text
planning
generation
providers
speech
rendering
QA
publishing
storage
localization
configuration
```

---

# 18. Runtime Configuration

Create:

```text
configuration/runtime-config.md
indexes/config-values.json
```

Inspect:

```text
.env.example
configuration schemas
provider config
model config
genre config
locale config
feature flags
CLI defaults
package defaults
episode overrides
content-pack overrides
```

Never include real credentials.

For configuration entries identify:

```text
name
definition
default
required/optional
legacy/deprecated
override sources
consumers
runtime effect
```

---

# 19. Configuration Precedence Reconstruction

Create:

```text
configuration/config-precedence.md
```

This is mandatory.

Reconstruct actual precedence between sources such as:

```text
hard-coded defaults
repository configuration
package configuration
genre configuration
content-pack configuration
episode configuration
environment variables
CLI arguments
runtime overrides
provider-specific overrides
test/fixture overrides
```

Do not assume this ordering.

Infer it from code.

For important values show:

```text
default
all override sources
actual precedence
consumer
runtime effect
```

Prioritize:

```text
provider
model
reasoning effort
image model
speech model
voice
quality thresholds
retry limits
timeout limits
locale
feature flags
cache/reuse policy
approval policy
paid-provider mode
offline mode
```

---

# 20. AI Model Configuration

Create:

```text
configuration/ai-models.md
```

Determine from actual source/config:

- configured LLM models;
- configured image models;
- configured speech models;
- which tasks use which models;
- reasoning effort;
- escalation models;
- fallback models;
- environment overrides;
- episode overrides;
- genre overrides;
- provider overrides;
- paid QA models;
- prompt caching;
- semantic-hash reuse;
- response reuse;
- image reuse.

Do not infer values not visible in the repository.

---

# 21. Artifact Lifecycle

Create:

```text
architecture/artifact-lifecycle.md
```

Analyze:

```text
content packs
episode artifacts
scripts
semantic treatments
scene plans
visual events
image prompts
images
audio
timing
QA reports
approval artifacts
cache artifacts
hash indexes
rendered outputs
upload state
```

For each important artifact determine:

- creator;
- readers;
- source of truth;
- derived vs authoritative status;
- mutability;
- hash strategy;
- stale detection;
- invalidation;
- regeneration;
- resumability;
- versioning.

---

# 22. Error Handling

Create:

```text
operations/error-handling.md
```

Inspect:

- typed domain errors;
- generic Error;
- catch-all handling;
- provider error normalization;
- retryable classification;
- timeout classification;
- partial failure handling;
- process.exit;
- swallowed errors;
- ignored promise rejections;
- error wrapping;
- lost stack/context;
- CLI exit codes.

Reference actual source locations.

---

# 23. Observability

Create:

```text
operations/observability.md
```

Inspect:

- structured logging;
- correlation IDs;
- episode IDs;
- scene IDs;
- request IDs;
- provider request IDs;
- model usage;
- cost tracking;
- retry logs;
- latency;
- stage durations;
- cache hit/miss;
- quality-gate decisions;
- escalation decisions;
- CLI summaries.

Identify gaps that make production incidents difficult to reconstruct.

---

# 24. Concurrency

Create:

```text
architecture/concurrency.md
```

Inspect:

- Promise.all;
- Promise.allSettled;
- queues;
- semaphores;
- worker pools;
- provider throttling;
- concurrency configuration;
- parallel episode generation;
- parallel scene generation;
- filesystem races;
- shared manifests;
- locking;
- atomic writes;
- temp-file usage.

Identify:

- unbounded concurrency;
- race conditions;
- provider rate-limit risks;
- duplicate paid calls;
- unsafe concurrent writes.

---

# 25. Cache and Reuse Architecture

Create:

```text
architecture/cache-and-reuse.md
```

Inspect:

- OpenAI prompt caching;
- semantic-hash prompt reuse;
- image asset reuse;
- TTS reuse;
- provider-response reuse;
- intermediate artifact reuse;
- cache indexes;
- cache keys;
- hash composition;
- invalidation;
- provider/model inclusion;
- locale inclusion;
- prompt-version inclusion;
- configuration-version inclusion.

Determine whether cache correctness is deterministic.

Flag cases where changing model/provider/config could incorrectly reuse stale assets.

---

# 26. Type Safety

Create:

```text
architecture/type-safety.md
```

Inspect for:

- `any`;
- unsafe `unknown`;
- `as unknown as`;
- unchecked type assertions;
- unchecked JSON;
- weak discriminated unions;
- nullable states;
- optional values without validation;
- dynamic config casting;
- provider response assumptions;
- filesystem parsing assumptions;
- environment variable assumptions.

Do not simply count occurrences.

Explain architectural and runtime risk.

---

# 27. Legacy and Deprecation

Create:

```text
architecture/legacy-and-deprecation.md
```

Identify:

- deprecated adapters;
- compatibility wrappers;
- old orchestration paths;
- duplicate services;
- duplicate providers;
- deprecated commands;
- superseded artifact schemas;
- old quality systems;
- old planners;
- old prompt generators;
- transitional code.

Specifically analyze the speech legacy adapter.

---

# 28. Test Architecture

Create:

```text
testing/test-architecture.md
```

Inventory:

```text
unit
integration
contract
snapshot
golden
fixture
E2E
offline-provider
paid-provider
CLI
architecture
```

tests.

Identify:

- major untested boundaries;
- tests tied to implementation details;
- missing provider contract tests;
- missing failure-path tests;
- missing resume/idempotency tests;
- missing quality-gate transition tests.

Do not run paid-provider tests merely to generate the review pack.

---

# 29. Production Reliability

Create:

```text
operations/reliability.md
```

Analyze:

- resumability;
- idempotency;
- retries;
- partial execution;
- crash recovery;
- artifact corruption;
- repeated CLI invocation;
- provider outages;
- timeout handling;
- rate limiting;
- stale artifacts;
- interrupted generation;
- duplicate generation;
- upload retries;
- exactly-once vs at-least-once semantics where relevant.

---

# 30. Security

Create:

```text
operations/security.md
```

Inspect:

- credential handling;
- logging secrets;
- environment variables;
- OAuth tokens;
- file permissions;
- temporary files;
- shell execution;
- command injection;
- path traversal;
- URL fetching;
- unsafe deserialization;
- provider output validation;
- archive creation;
- upload metadata handling.

Do not expose actual secrets.

---

# 31. Performance

Create:

```text
architecture/performance.md
```

Analyze likely bottlenecks such as:

- repeated filesystem traversal;
- repeated JSON parsing;
- duplicate model/provider calls;
- missing cache reuse;
- sequential work that could safely be parallel;
- unsafe parallel work;
- repeated hashing;
- full-pack rewrites;
- synchronous filesystem calls;
- large manifests;
- excessive source loading;
- repeated model escalation;
- duplicate QA calls.

Separate:

```text
PROVEN
HIGH-CONFIDENCE
HYPOTHESIS
```

findings.

---

# 32. Architectural Findings

Generate:

```text
architecture/findings.md
```

Classify:

```text
P0 critical
P1 high
P2 medium
P3 low
```

For each finding include:

```text
ID
severity
title
affected files
evidence
architectural impact
runtime impact
recommended remediation
confidence
```

Do not present speculation as fact.

---

# 33. Current Architecture Reconstruction

Create:

```text
architecture/current-architecture.md
```

Explain:

- domains;
- layers;
- packages;
- orchestration model;
- ports/adapters;
- providers;
- artifact model;
- state model;
- configuration architecture;
- dependency direction;
- CLI architecture.

Explicitly distinguish:

```text
documented architecture
inferred intended architecture
actual architecture
```

when they differ.

---

# 34. Source Index

Generate:

```text
indexes/source-index.json
```

For each included source file record:

```ts
interface SourceIndexEntry {
  path: string;
  size: number;
  sha256: string;
  category?: string;
  symbols?: string[];
  referencedBy?: string[];
}
```

Use deterministic ordering.

---

# 35. Important Symbol Index

Generate:

```text
indexes/symbols.md
```

Index important:

```text
classes
functions
interfaces
types
commands
services
orchestrators
providers
adapters
repositories
quality gates
registries
factories
```

Point to source paths.

A full repository-wide AST database is unnecessary unless inexpensive.

---

# 36. Manifest

Generate:

```text
manifest.json
```

At minimum include:

```json
{
  "schemaVersion": "...",
  "generatorVersion": "...",
  "generatedAt": "...",
  "repository": {},
  "scope": {},
  "files": [],
  "hashes": {},
  "warnings": [],
  "exclusions": [],
  "truncations": [],
  "coverage": {}
}
```

Use deterministic ordering.

Design stable identifiers and hashes so future pack-to-pack diffing is possible.

---

# 37. Pack Validation

Before creating the ZIP validate:

- required reports exist;
- mandatory source areas are included;
- source-index entries resolve;
- manifest paths resolve;
- hashes match;
- JSON parses;
- required schemas are structurally valid;
- ZIP has expected root directory;
- no absolute repository paths leak unnecessarily;
- no secret files were included;
- source paths remain repository-relative.

Fail clearly on critical integrity issues.

---

# 38. Secret Protection

Implement explicit denylisting/redaction.

At minimum exclude:

```text
.env
.env.*
credentials.json
token.json
*.pem
*.key
private keys
OAuth tokens
service-account files
API-key files
```

Allow safe examples such as:

```text
.env.example
```

where appropriate.

Also scan included text for obvious credential patterns.

If a potentially sensitive file is discovered:

- exclude it;
- record the exclusion;
- never print its contents.

---

# 39. File Size Control

The pack must remain practical to upload to ChatGPT.

Do not blindly copy the repository.

Prioritize:

1. architecture-critical source;
2. orchestration;
3. CLI;
4. provider adapters;
5. quality gates;
6. configuration;
7. contracts;
8. representative tests;
9. state/artifact schemas.

Avoid:

- videos;
- audio;
- images;
- binary caches;
- build output;
- package-manager stores.

Support options similar to:

```bash
--max-source-bytes
--max-file-bytes
```

Record all truncations/exclusions.

If a source file is too large, prefer excluding low-value regions only if source selection can remain reliable.

Never silently truncate architecture-critical code.

---

# 40. Determinism

Given:

```text
same repository state
same configuration
same generator version
```

the selected source set and manifest should be deterministic except for explicit volatile metadata such as generation timestamp.

Sort:

- files;
- packages;
- dependencies;
- indexes;
- command lists;
- quality gates;
- feature flags;
- configuration entries;
- JSON keys where practical.

---

# 41. Prefer Static Analysis Over Paid AI

Generating the review pack must **not require paid OpenAI calls**.

Use:

- repository inspection;
- TypeScript AST;
- package manifests;
- tsconfig;
- import analysis;
- command registration;
- static config inspection;
- tests;
- git metadata;
- CLI help output.

If reusable AI-assisted architecture analysis already exists, keep it optional.

The pack should contain evidence so ChatGPT performs the reasoning later.

---

# 42. AI/Content-Pack Integration

Inspect the existing AI/content-pack implementation.

Reuse generic primitives where appropriate:

```text
manifest generation
hashing
ZIP export
file indexing
artifact validation
deterministic serialization
safe file copying
redaction
```

Do not make architecture review dependent on:

```text
episodes
scenes
narration
genre-specific content-pack semantics
```

Use the smallest clean shared abstraction.

---

# 43. Future Diff Review

Architect manifests for future comparison:

```text
review-pack A
vs
review-pack B
```

Ensure stable:

- source file paths;
- source hashes;
- gate IDs;
- command IDs;
- pipeline IDs;
- symbol IDs where practical.

Do not implement a large diff engine unless trivial.

---

# 44. Mandatory Exhaustive Behavioral-Surface Reconstruction

A central objective is to preserve the **complete observable behavioral surface**, not only the happy path.

Search systematically for:

- current commands;
- legacy commands;
- deprecated commands;
- aliases;
- hidden/internal commands;
- compatibility commands;
- experimental commands;
- fixture commands;
- offline commands;
- migration commands;
- repair commands;
- remediation commands;
- validation-only commands;
- inspect commands;
- approval commands;
- rejection commands;
- force commands;
- retry commands;
- resume commands;
- refresh commands.

Create:

```text
architecture/behavioral-surface.md
indexes/cli-commands.json
indexes/cli-options.json
```

For every discovered command capture where possible:

```ts
interface CliCommandInventoryEntry {
  command: string;
  aliases: string[];
  sourcePath: string;
  status:
    | "current"
    | "legacy"
    | "deprecated"
    | "experimental"
    | "internal"
    | "unknown";
  options: CliOptionInventoryEntry[];
  entrypoint?: string;
  orchestrationTarget?: string;
  sideEffects: string[];
  qualityGates: string[];
  featureFlags: string[];
  configDependencies: string[];
}
```

Do not rely solely on docs.

Derive from command registration and implementation.

Cross-check against:

```text
--help
package.json scripts
README examples
shell scripts
CI workflows
tests
```

Identify:

- implemented but undocumented commands;
- documented but missing commands;
- aliases not documented;
- legacy commands still reachable;
- duplicated commands reaching different implementations.

---

# 45. Mandatory Option and Variation Analysis

For every production-relevant command, determine which options materially alter execution.

Potential examples:

```text
--force
--resume
--refresh
--provider
--model
--reasoning
--offline
--fixture
--trusted-script
--skip-*
--reuse-*
--refresh-*
--dry-run
--json
--locale
--genre
--scope
--approval
--paid-provider
```

Do not assume these names exist.

Discover actual options.

Create:

```text
architecture/execution-variations.md
```

For every important variation document:

```text
trigger
source location
affected stages
changed dependencies
changed artifacts
changed quality gates
changed provider calls
changed cache behavior
changed failure behavior
changed state transitions
```

Classify combinations as:

```text
supported
unsupported
ambiguous
untested
legacy
```

Where combinatorial explosion exists, identify semantically distinct combinations rather than enumerating meaningless Cartesian products.

---

# 46. Mandatory Feature-Flag Inventory

Search for behavioral branches controlled by:

```text
environment variables
configuration flags
experimental flags
genre flags
provider flags
episode metadata
manifest fields
runtime capability detection
```

Create:

```text
indexes/feature-flags.json
architecture/feature-flags.md
```

For each flag record:

```text
name
definition
default
source
consumers
enabled behavior
disabled behavior
status
```

Identify:

- dead flags;
- duplicated flags;
- inverted semantics;
- overlapping flags;
- flags with undocumented side effects;
- flags whose default differs across entrypoints.

---

# 47. Mandatory Quality-Gate Reconstruction

Quality gates are first-class architecture.

Reconstruct every gate that can:

```text
block
warn
remediate
retry
escalate
skip
approve
reject
downgrade
mark production-ready
```

Search production source and tests.

Do not assume the newest quality pipeline is the only active pipeline.

Identify:

- genre-specific gates;
- legacy gates;
- compatibility gates;
- optional gates;
- provider-readiness gates;
- editorial gates;
- semantic gates;
- scene gates;
- sequence gates;
- publishing gates.

Generate:

```text
quality/gate-inventory.md
quality/gate-matrix.md
quality/gate-dependencies.md
quality/remediation-flow.md
quality/readiness-state-machine.md
indexes/quality-gates.json
```

For every gate include where possible:

```ts
interface QualityGateInventoryEntry {
  id: string;
  name: string;
  sourcePath: string;

  scope:
    | "scene"
    | "sequence"
    | "episode"
    | "asset"
    | "provider"
    | "publishing"
    | "other";

  severity?: string;

  inputs: string[];
  outputs: string[];

  outcome:
    | "pass"
    | "warn"
    | "block"
    | "remediate"
    | "escalate"
    | "unknown";

  thresholds?: Record<string, unknown>;

  canSkip: boolean;
  skipConditions: string[];

  canRetry: boolean;
  retryPolicy?: string;

  remediation?: string;
  escalation?: string;

  genres?: string[];
  modes?: string[];
  legacy?: boolean;
}
```

Determine:

- what causes each gate to execute;
- what causes it to skip;
- which artifact it reads;
- which artifact/state it writes;
- whether deterministic;
- whether it calls an external provider;
- whether it costs money;
- what happens on failure;
- whether failure blocks production;
- whether remediation occurs;
- whether rejudging occurs;
- whether escalation occurs;
- retry budget;
- remediation budget;
- whether results can be reused;
- stale-result invalidation;
- genre differences;
- locale differences.

---

# 48. Quality-Gate Matrix

Generate a matrix across discovered genres/modes.

Example only:

```text
                         History   Horror   Veronica   Math
Semantic gate               ✓         ✓         ✓        ?
Scene judge                 ✓         ?         ✓        ?
Sequence judge              ✓         ?         ✓        ?
Editorial repetition        ✓         ?         ?        ?
Provider readiness          ✓         ✓         ✓        ✓
Approval gate               ...       ...       ...      ...
```

Use actual evidence.

Mark cells:

```text
enabled
disabled
conditional
legacy
unknown
not applicable
```

Never guess.

---

# 49. Quality Gate Dependency Graph

Create:

```text
quality/gate-dependencies.md
```

Represent dependencies such as:

```text
                         ┌───────────────┐
                         │ Pipeline Step │
                         └───────┬───────┘
                                 │
                     ┌───────────▼──────────┐
                     │ Preconditions/Gates │
                     └───────────┬──────────┘
                                 │
          ┌──────────────────────┼──────────────────────┐
          │                      │                      │
        PASS                   FAIL                   WARN
          │                      │                      │
          │             ┌────────▼─────────┐            │
          │             │ Auto-remediation │            │
          │             └────────┬─────────┘            │
          │                      │                      │
          │                   Rejudge                   │
          │                      │                      │
          │               ┌──────▼───────┐              │
          │               │ Escalation   │              │
          │               └──────┬───────┘              │
          │                      │                      │
          └──────────────────────▼──────────────────────┘
                         readiness state
```

This diagram is illustrative only.

Reconstruct the actual dependency graph.

---

# 50. Workflow State-Machine Reconstruction

Create:

```text
architecture/workflow-state-machine.md
quality/readiness-state-machine.md
```

Identify actual states from:

```text
types
schemas
manifests
CLI behavior
tests
artifact existence
status files
```

Possible examples:

```text
planned
validated
blocked
remediating
approved
production-ready
rendered
uploaded
failed
```

Do not assume names.

Identify:

- legal transitions;
- illegal transitions;
- implicit transitions;
- terminal states;
- recoverable states;
- stale state;
- state inferred only from artifact combinations.

---

# 51. Automatic Remediation Analysis

Inspect all remediation loops.

Reconstruct:

```text
initial evaluation
→ failure
→ remediation decision
→ regenerated/revised artifact
→ re-evaluation
→ escalation
→ terminal decision
```

Capture:

- attempt count;
- retry budget;
- remediation budget;
- escalation provider/model;
- escalation reasoning;
- stop conditions;
- persisted state;
- artifact history;
- idempotency;
- cost implications;
- manual intervention points.

---

# 52. Legacy Execution-Path Discovery

Do not detect legacy code only by searching for:

```text
@deprecated
legacy
old
v1
v2
```

Search structurally for competing implementations of the same responsibility.

Examples:

```text
multiple planners
multiple prompt generators
multiple scene planners
multiple semantic pipelines
multiple TTS paths
multiple image pipelines
multiple rendering paths
multiple upload paths
multiple artifact formats
multiple QA systems
multiple CLI commands reaching similar services
```

Determine whether each is:

```text
actively used
reachable but undocumented
compatibility-only
test-only
dead
unknown
```

Generate:

```text
architecture/execution-paths.md
indexes/execution-paths.json
```

For every major responsibility list:

```text
implementation
callers
entrypoints
conditions
status
replacement
remaining consumers
reachability confidence
```

---

# 53. Versioned Pipeline Discovery

Search explicitly for versioned implementations:

```text
v1
v2
v3
v3.x
legacy
next
experimental
beta
```

Do not assume exact names.

Generate:

```text
architecture/pipeline-versions.md
indexes/pipeline-versions.json
```

For each version capture:

```text
entrypoints
callers
status
differences
shared infrastructure
artifact schemas
quality gates
migration path
remaining consumers
```

Identify situations where old and new versions coexist.

---

# 54. Genre Variation Analysis

Do not assume all genres share one pipeline.

Discover all genres first.

Create:

```text
architecture/genre-variation-matrix.md
```

Compare each genre across:

```text
script handling
research
claims
semantic treatment
localization
TTS
timing
scene planning
visual planning
image prompting
image generation
maps
diagrams
QA
approval
rendering
publishing
metadata
```

Mark:

```text
shared
overridden
disabled
legacy
conditional
not applicable
unknown
```

---

# 55. Locale Variation Analysis

Create:

```text
architecture/locale-variation-matrix.md
```

Determine whether locale affects:

```text
script
TTS provider
voice
speech model
WPM assumptions
actual audio timing
visual text
images
prompts
scene boundaries
metadata
titles
descriptions
captions
rendering
upload
QA
cache keys
```

Identify whether localized variants share or regenerate:

- visual plans;
- scene plans;
- images;
- image prompts;
- QA results;
- timing;
- metadata.

---

# 56. Provider Variation Matrix

Create:

```text
architecture/provider-matrix.md
```

Inventory providers for:

```text
LLM
image generation
speech
storage
rendering
research
publishing
```

For each provider determine:

```text
selection mechanism
configuration
fallback
retry
timeout
rate limiting
cost accounting
cache semantics
offline fixture
legacy compatibility
```

---

# 57. Test-Derived Behavioral Evidence

Tests may encode contracts missing from documentation.

Create:

```text
testing/behavioral-contracts.md
```

Inspect tests for:

- gate behavior;
- skip conditions;
- edge cases;
- legacy compatibility;
- option combinations;
- failure transitions;
- provider fallback;
- cache invalidation;
- resumability;
- retry behavior;
- state transitions;
- approval behavior.

Separate:

```text
behavior proven by implementation
behavior explicitly tested
behavior implied only by tests
behavior documented but not tested
```

---

# 58. Call-Site Completeness

For architecturally important modules determine call sites.

Prioritize:

```text
services
commands
providers
adapters
quality gates
legacy modules
registries
factories
orchestrators
```

Do not conclude a module is active or dead solely because it exists.

Use:

- imports;
- command registration;
- dependency injection;
- factories;
- registries;
- configuration;
- dynamic dispatch;
- tests.

Record reachability confidence.

---

# 59. Dynamic-Dispatch Caveat

Explicitly inspect patterns static import graphs may miss:

```text
dynamic import()
registry lookup
string-based provider selection
dependency injection tokens
command registries
plugin registries
filesystem discovery
configuration-driven factories
reflection
```

Document these mechanisms.

Do not falsely classify dynamically loaded code as dead.

---

# 60. Runtime-Effective CLI Snapshots

Where safe and non-destructive, capture the effective CLI command hierarchy.

Examples:

```bash
pnpm youtube --help
pnpm youtube audit --help
pnpm youtube history --help
pnpm youtube history visuals --help
pnpm youtube veronica --help
```

Discover actual hierarchy rather than assuming these commands.

Store snapshots under:

```text
indexes/cli-help/
```

Also inspect:

```text
package.json scripts
workspace scripts
shell scripts
GitHub workflows
README examples
```

Use these snapshots to compare:

```text
registered commands
documented commands
actually reachable commands
legacy commands
aliases
```

Do not execute commands that:

- invoke paid providers;
- upload/publish;
- mutate production artifacts;
- delete data;
- run expensive generation.

Use only safe help/introspection modes.

---

# 61. Behavioral Cross-Reference Indexes

In addition to prose reports, generate machine-readable cross-reference data.

For example:

```json
{
  "id": "QUALITY_SCENE_JUDGE",
  "implementation": [
    "packages/.../scene-judge.ts"
  ],
  "callers": [
    "packages/.../planning-orchestrator.ts"
  ],
  "conditions": [
    "paidQaEnabled",
    "sceneRequiresJudging"
  ],
  "inputs": [
    "scene-plan.json"
  ],
  "outputs": [
    "scene-quality-review.json"
  ],
  "next": {
    "pass": "sequence-judge",
    "fail": "scene-remediation"
  }
}
```

Provide equivalent structured relationships for:

- CLI commands;
- quality gates;
- providers;
- pipeline stages;
- execution paths;
- feature flags;
- important config;
- artifact producers/consumers.

The goal is to allow ChatGPT to jump from a concept directly to relevant source files.

---

# 62. Behavioral Uncertainty Register

Create:

```text
architecture/uncertainties.md
```

Whenever behavior cannot be conclusively determined, record:

```text
question
relevant files
why uncertain
possible interpretations
what runtime evidence would resolve it
confidence
```

Do not silently invent missing behavior.

---

# 63. Completeness Report

Create:

```text
COMPLETENESS.md
```

Explicitly report discovery coverage for:

```text
packages
source selection
entrypoints
CLI commands
CLI aliases
CLI options
feature flags
configuration precedence
quality gates
gate ordering
gate skip conditions
remediation loops
escalation
readiness states
pipeline versions
legacy implementations
genre overrides
locale overrides
provider variations
cache/reuse
tests
dynamic dispatch
mandatory source areas
```

Classify every category:

```text
COMPLETE
HIGH CONFIDENCE
PARTIAL
UNKNOWN
```

Include rationale.

Do not equate pack integrity with architectural completeness.

---

# 64. Specific Questions the Pack Must Be Able to Answer

Before declaring success, inspect the generated pack and verify that a future reviewer can answer questions like:

```text
Why was sequence judging skipped?
```

```text
Which gate marks an episode as non-production-ready?
```

```text
Which remediation loops allow one attempt versus multiple attempts?
```

```text
Which quality checks use a cheap model and which escalate to a stronger model?
```

```text
Does trusted-script mode bypass only research or also other gates?
```

```text
Does --force invalidate existing QA artifacts?
```

```text
Does --resume reuse stale intermediate artifacts?
```

```text
Which old planner can still be invoked?
```

```text
Which legacy commands are still reachable?
```

```text
Are there two active image-generation pipelines?
```

```text
Which provider is selected for each genre?
```

```text
Can localized Veronica episodes share scene QA with the master locale?
```

```text
Which configuration source wins when CLI, environment, genre config, and episode config disagree?
```

```text
Which quality gates are genre-specific?
```

```text
Which artifact determines canonical timing?
```

```text
Which code path uploads to YouTube?
```

```text
What still depends on the speech legacy adapter?
```

If the pack cannot answer these despite the source being present in the repository, improve source selection and indexing.

---

# 65. Implementation Quality

Use production-grade TypeScript.

Requirements:

- strict typing;
- no unnecessary `any`;
- explicit domain models;
- schema validation where needed;
- safe filesystem handling;
- deterministic behavior;
- normalized repository-relative paths;
- dependency injection where already used;
- cohesive modules;
- testable services;
- no hidden mutable globals;
- typed error handling;
- safe child-process execution;
- no shell injection;
- bounded resource use;
- useful inline documentation for non-obvious architecture.

Follow existing repository conventions.

---

# 66. Tests

Add focused tests for the new functionality.

At minimum test:

- source inclusion;
- source exclusion;
- secret exclusion;
- path normalization;
- deterministic manifests;
- hashing;
- required-file validation;
- source index;
- package index;
- CLI inventory;
- feature flag inventory where feasible;
- quality gate inventory where feasible;
- ZIP root structure;
- mandatory source area inclusion;
- stable ordering;
- configuration precedence extraction where feasible;
- CLI help snapshot collection;
- no mutation during introspection.

Use fixtures where useful.

Do not run unrelated expensive repository-wide test suites unless necessary.

Follow the project's risk-based validation policy:

1. test/typecheck affected packages;
2. run focused integration tests;
3. escalate to broader validation only when shared infrastructure changes justify it.

Do not perform paid provider calls.

---

# 67. Documentation

Add a concise developer document describing:

```bash
pnpm youtube audit build-review-pack
```

Include:

- purpose;
- scopes;
- output path;
- exclusions;
- secret safety;
- size controls;
- ZIP behavior;
- deterministic behavior;
- how to upload the ZIP to ChatGPT;
- how to regenerate after repository changes.

---

# 68. Final Execution

After implementation, run the repository-level pack generator.

Produce a real pack:

```text
artifacts/review-packs/youtube-architecture-review-<timestamp>/
artifacts/review-packs/youtube-architecture-review-<timestamp>.zip
```

Inspect the generated output yourself.

Verify source evidence exists for:

1. main image pipeline;
2. OpenAI image adapter;
3. CLI composition root;
4. YouTube upload entry;
5. speech legacy adapter.

Also verify the pack contains enough evidence to reconstruct:

- end-to-end production;
- localization;
- AI model configuration;
- quality gates;
- quality-gate ordering;
- skip logic;
- remediation;
- escalation;
- readiness state;
- cache/reuse;
- feature flags;
- CLI options;
- legacy paths;
- pipeline versions;
- genre variations;
- locale variations;
- provider variations;
- config precedence;
- tests.

---

# 69. Self-Audit the Generated Pack

Do not stop after successfully producing a ZIP.

Perform a bounded self-audit.

Check whether the pack accidentally over-relies on generated summaries.

For every major architectural conclusion, ensure the relevant source files are actually included.

Check for missing context such as:

- interface without implementation;
- implementation without caller;
- command without registration;
- provider without factory;
- gate without orchestrator;
- legacy adapter without consumers;
- config value without precedence evidence;
- artifact schema without producer/consumer.

If evidence is missing, adjust pack selection before finalizing.

---

# 70. No Silent Broad Refactors

If the existing architecture makes some required analysis difficult:

- document the problem;
- make only the smallest necessary infrastructure change;
- avoid redesigning production pipelines;
- avoid replacing existing provider architecture;
- avoid changing quality policy;
- avoid changing runtime behavior.

This task is about **review-pack infrastructure**, not production pipeline remediation.

---

# 71. Final Response

When finished, report:

## Implementation

- files added;
- files modified;
- architecture chosen;
- generic AI/content-pack infrastructure reused;
- generic infrastructure extracted;
- intentionally deferred work.

## Generated Review Pack

Provide:

- unpacked path;
- ZIP path;
- total files;
- source files included;
- ZIP size;
- excluded files count;
- truncation count.

## Validation

Report:

- focused tests;
- typecheck;
- pack integrity validation;
- secret scan;
- deterministic generation validation;
- safe CLI introspection validation.

## Mandatory Coverage

Explicitly confirm evidence was included for:

- main image pipeline;
- OpenAI image adapter;
- CLI composition root;
- YouTube upload entry;
- speech legacy adapter.

## Behavioral Coverage

Report completeness for:

- commands;
- aliases;
- options;
- feature flags;
- configuration precedence;
- quality gates;
- gate skip conditions;
- remediation loops;
- escalation;
- readiness states;
- legacy paths;
- pipeline versions;
- genre variations;
- locale variations;
- provider variations;
- cache/reuse;
- dynamic dispatch.

## Architectural Observations

List significant issues discovered while implementing the pack.

Do not silently fix unrelated architecture.

If major remediation is warranted, document it for a separate task.

---

# 72. Acceptance Criteria

This task is complete only when all of the following are true:

- a repository-level review pack can be generated with one CLI command;
- the generated ZIP is uploadable to ChatGPT;
- actual source code is included;
- mandatory implementation areas are present;
- CLI commands and meaningful options are inventoried;
- quality gates are inventoried;
- quality-gate dependencies are reconstructed;
- remediation and escalation paths are reconstructed;
- readiness states are reconstructed;
- legacy execution paths are analyzed;
- versioned pipelines are analyzed;
- genre-specific variations are analyzed;
- locale-specific variations are analyzed;
- provider-specific variations are analyzed;
- configuration precedence is analyzed;
- feature flags are analyzed;
- dynamic-dispatch mechanisms are documented;
- tests are included as behavioral evidence;
- machine-readable cross-references exist;
- secrets are excluded;
- manifests and hashes validate;
- pack generation requires no paid provider calls;
- the completeness report accurately distinguishes COMPLETE, HIGH CONFIDENCE, PARTIAL, and UNKNOWN coverage;
- the generated pack has been self-audited for missing architectural evidence.

The objective is not simply to produce documentation.

The objective is to generate a **forensic, source-grounded architecture and behavioral review artifact** that preserves enough implementation context for deep ChatGPT analysis and follow-up questioning.
