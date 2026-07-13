# Finish the mathematics genre implementation

Continue from the current repository and worktree.

Your goal is to complete the remaining mathematics genre implementation safely, including:

1. Repairing and accepting R-009.
2. Implementing and accepting R-010.
3. Establishing the release gates required by R-011.
4. Running and accepting the provider-free offline pilot required by R-012.
5. Leaving the repository in a truthful, reviewable state with no known Critical or High mathematics blockers.

Do not merely generate another implementation report or another repair prompt. Perform the implementation, tests, adversarial review, repair, and verification in this run as far as the repository and verification environment permit.

## Authoritative inputs

Read first:

- `AGENTS.md`
- `docs/ai-context/context-pack.md`
- every file under `docs/mathe/plans/`
- every file under `docs/mathe/audits/`
- every file under `docs/mathe/prompts/`
- every existing file under `todo-prompts/math-followups/`
- the current mathematics implementation report
- every current mathematics Codex-run report under `docs/reports/codex-runs/`
- all source and test files referenced by the remediation backlog

Use Git and current source as authoritative.

Reports and prompt files are historical evidence. Do not assume that their expected commit hashes, status descriptions, file paths, or claimed test results still match the worktree.

## Initial repository inspection

Before editing:

1. Run and record:

   - `git status --short --branch`
   - `git rev-parse HEAD`
   - `git log -10 --oneline`
   - the relevant package and workspace status

2. Identify all tracked and untracked pre-existing changes.
3. Preserve every unrelated change.
4. Do not clean, reset, checkout, stash, delete, regenerate, or overwrite unrelated files.
5. Do not edit generated `dist` trees or generated episode/media assets.
6. Detect the earliest incomplete or rejected remediation task from the current backlog.
7. Inspect the corresponding implementation, acceptance report, repair prompt, production entry points, and tests.
8. Produce a concise internal dependency map for the remaining tasks.

The expected historical state is:

- R-001 through R-008 accepted.
- R-009 implemented but rejected in independent acceptance.
- R-010, R-011, and R-012 not yet complete.

Treat that only as a hypothesis. Current Git state, source, tests, and backlog are authoritative.

## Non-negotiable safety constraints

Throughout this task:

- Do not call paid providers.
- Do not instantiate live OpenAI, speech, image, renderer, YouTube, or other network clients.
- Do not publish, upload, mutate playlists, modify live channels, or use real credentials.
- Do not perform remote rendering.
- Do not use a story/horror implementation as a fallback for missing mathematics behavior.
- Preserve all existing story and horror defaults and behavior.
- Keep the mathematics packages one-way and isolated from story packages.
- Do not weaken schemas, assertions, tests, validation, quality gates, lineage checks, or security controls.
- Do not update broad snapshots or regenerate fixtures merely to make tests pass.
- Do not accept placeholders, skipped stages, caller-supplied status values, or self-consistent forged hashes as authoritative evidence.
- Do not silently classify an unsupported critical operation as successful.
- Do not claim a test or runtime path was verified when it was not executed.

## Execution strategy

Work through the remaining remediation tasks in strict dependency order:

```text
R-009
→ R-010
→ R-011
→ R-012
```

For each task, use the following lifecycle:

```text
inspect authoritative production path
→ map requirements to tests
→ add failing adversarial tests
→ implement minimal coherent repair
→ run focused checks
→ adversarially attack the result
→ repair every discovered material defect
→ verify the actual production entry point
→ run the task acceptance gate
→ record a truthful decision
```

Do not defer a defect discovered during self-review to another generated repair prompt. Add a regression test and repair it in the current task while the verification budget permits.

Do not begin the next remediation task until the current task has passed its required source review, focused tests, production-path proof, and acceptance criteria.

Where genuine independent acceptance is required, use a fresh isolated reviewer/subagent context if the environment supports it. The independent reviewer must:

- receive the acceptance contract and repository state;
- not receive implementation reasoning or intended solutions;
- perform adversarial source review;
- have no permission to repair production code;
- return an explicit accept or reject decision.

If isolated review is unavailable, perform a clearly labelled adversarial self-review, do not misrepresent it as independent, and record that limitation.

---

# Phase 1 — Repair and finish R-009

R-009 covers:

- localized metadata;
- deterministic math-native thumbnails;
- playlist catalog and assignments;
- channel and publishing policy;
- safe publish dry-run;
- shared YouTube upload infrastructure without horror regressions.

Read the current R-009 implementation report, independent acceptance report, and repair prompt before editing.

## R-009 blocker A — Authoritative metadata provenance

`generateMathMetadata` must not accept arbitrary caller-supplied ordering or identity-free timing data.

Implement one strict, versioned metadata evidence contract that binds metadata generation to:

- curriculum release ID and release content hash;
- reviewed prerequisite DAG release;
- stable topological order;
- current skill ID and lesson ID;
- grade, topic, variant, and language;
- authoritative canonical lesson artifact;
- authoritative localized narration artifact;
- authoritative timing artifact;
- selected locale;
- exact workflow stage ownership;
- exact parent fingerprints and output lineage;
- source producer and producer version.

The metadata generator must derive previous/next curriculum neighbors from the validated release and DAG evidence. It must not trust a caller-supplied order or neighbor list.

Reject:

- reordered curriculum entries;
- a DAG from another release;
- unknown, duplicated, disconnected, or mismatched skill identities;
- timing from another lesson or locale;
- localized narration from another lesson or locale;
- stale, missing, extra, duplicated, reordered, or mismatched parent hashes;
- forged artifacts with recomputed internal hashes;
- valid artifacts not owned by the authoritative workflow;
- caller-supplied chapters whose timestamps or scene identities do not match authoritative timing.

Metadata for all five languages must be fully localized:

- `de`
- `en`
- `es`
- `fr`
- `pt`

Validate title, description, chapters, tags, grade/topic/variant labels, playlist names, and all human-visible metadata surfaces.

## R-009 blocker B — Verifier-bound thumbnail semantics

Thumbnail mathematical claims must be bound to authoritative verified facts.

Implement a strict thumbnail evidence contract containing:

- exact lesson, skill, variant, locale, and curriculum release identity;
- authoritative lesson and localization lineage;
- authoritative verifier result identity and content hash;
- exact referenced fact IDs;
- exact normalized AST and unit semantics for every displayed mathematical value;
- renderer version and cache identity;
- measured or demonstrably conservative visual bounds;
- safe-area and minimum-readable-glyph evidence;
- output binary hash and size;
- owning workflow stage and parent fingerprints.

Do not accept an arbitrary “verification hash” string as proof.

Reject:

- unknown or unverified fact IDs;
- same fact ID with a different AST;
- same fact ID with a different unit, scale, dimension, or angle semantics;
- facts from another lesson, locale, scene, or verifier request;
- omitted, duplicated, extra, or reordered facts;
- forged verification hashes;
- formula overflow;
- clipped or unreadable text;
- missing or unprovable bounds;
- unsafe-area violations;
- binary output whose bytes do not match its artifact hash.

Thumbnail text must remain concise and readable, using the approved 2–5-word contract.

Every renderer behavior change must change the renderer/cache identity.

## R-009 blocker C — Binary asset lineage

The CLI and publish preflight must consume only workflow-owned binary assets.

Add or reuse one strict binary artifact contract for:

- final video;
- thumbnail;
- any required sidecar media evidence.

Validate before publish preflight:

- regular contained file;
- no traversal or symlink escape;
- exact byte length;
- exact content hash calculated from the bytes;
- correct lesson and locale;
- correct owning workflow stage;
- exact parent fingerprints;
- correct producer and producer version;
- exactly one authoritative output;
- final media QA ownership and readiness;
- no stale, duplicate, swapped, or untracked asset.

Reject arbitrary file paths or bytes supplied through the CLI.

## R-009 blocker D — One shared YouTube mutation seam

The mathematics publisher must not duplicate the legacy live mutation sequence.

Extract or identify one internal, genre-neutral, legacy-compatible YouTube mutation seam used by both:

- the existing story/horror upload wrapper;
- the new mathematics publish core.

Preserve the existing story/horror public API and defaults.

The shared seam must retain or strengthen the existing behavior for:

- `videos.insert`;
- thumbnail assignment;
- multiple playlist assignments;
- retries;
- timeouts;
- telemetry;
- upload verification;
- short/full thumbnail behavior where applicable;
- idempotent playlist assignment;
- partial progress;
- persistent or resumable reports;
- structured failures.

Every prior mutation report must be runtime-schema validated before reuse.

Partial-report resume must:

- avoid repeating completed video insertion;
- avoid repeating completed thumbnail assignment;
- avoid repeating completed playlist assignments;
- retry only explicitly retryable incomplete operations;
- reject stale, malformed, identity-mismatched, or cross-video reports;
- retain successful operations when a later playlist operation fails.

The mathematics public surface must remain dry-run-only unless a separate future task explicitly enables live publishing.

A dry run must not:

- instantiate a live client;
- read live credentials;
- dispatch network calls;
- create uploads;
- set thumbnails;
- mutate playlists.

## Required R-009 adversarial tests

Add direct tests for at least:

- reordered curriculum/DAG order;
- wrong curriculum release;
- cross-lesson timing transplant;
- cross-locale timing transplant;
- caller-supplied previous/next neighbors;
- forged metadata evidence with recomputed hashes;
- verifier hash without verifier evidence;
- same fact ID with changed AST;
- same fact ID with changed units;
- long but schema-valid formula overflow;
- unreadable thumbnail glyph size;
- missing measured bounds;
- arbitrary thumbnail bytes;
- arbitrary media bytes;
- wrong binary hash or byte length;
- binary artifact not owned by the workflow;
- symlink/path escape;
- stale and swapped media artifacts;
- malformed prior publish report;
- cross-video prior report;
- interrupted upload after video insertion;
- interrupted upload after thumbnail assignment;
- interrupted multi-playlist assignment;
- resume with zero duplicate successful mutations;
- mathematics dry run creating zero client instances and zero mutations;
- legacy story/horror wrapper characterization remaining unchanged.

## R-009 production-path proof

Exercise the actual package and CLI path, not a source-only helper:

```text
production CLI entry point
→ authoritative workflow manifest
→ metadata artifact
→ thumbnail artifact
→ final media artifact
→ quality/publish permission
→ dry-run publish packet
→ zero mutation result
```

Confirm semantic CLI exit codes remain:

- `0` for successful selected dry-run targets;
- `1` for invalid input, schema, manifest, lineage, hash, path, or configuration;
- `2` only for a genuine mixed multi-target result;
- `3` when all selected targets are validly classified as blocked.

Run the directly affected focused tests and affected-package typechecks.

After passing tests, conduct a fresh adversarial review of the complete R-009 production path. Repair any material weakness found and add a regression test before considering R-009 complete.

Record R-009 as accepted only when the acceptance contract is fully supported. Otherwise keep it pending and record the exact unsupported criterion.

---

# Phase 2 — Implement R-010 structured observability and redaction

Implement one versioned mathematics telemetry and debug-evidence contract.

Every relevant event must include, where applicable:

- correlation ID;
- execution ID;
- batch ID;
- curriculum release ID and hash;
- skill ID;
- lesson ID;
- variant;
- language;
- stage;
- provider;
- model or worker identity;
- provider/worker version;
- attempt number;
- start time;
- duration;
- cache decision;
- cache key or safe cache identity;
- retry classification;
- stable error category;
- success/failure status;
- token usage;
- cost;
- currency;
- unknown-price warning;
- artifact paths expressed safely relative to the workspace;
- input/output artifact content hashes.

Connect telemetry to:

- curriculum loading and validation;
- lesson generation;
- verifier process boundary;
- localization;
- TTS;
- visual/thumbnail rendering;
- Remotion/FFmpeg;
- workflow stages;
- batch items and retries;
- metadata;
- publish dry-run;
- shared YouTube mutation seam without exposing secrets.

Workflow and batch state must link to correlation IDs.

## R-010 redaction requirements

Never log:

- credentials;
- API keys;
- OAuth tokens;
- bearer tokens;
- authorization headers;
- cookies;
- environment dumps;
- secrets embedded in URLs;
- raw binary;
- Base64 image/audio/video payloads;
- unrestricted request or response bodies;
- full process environments.

Implement recursive, bounded redaction for objects, arrays, strings, errors, headers, URLs, and provider payloads.

The debug logger must:

- enforce maximum depth;
- enforce maximum field count;
- enforce maximum string length;
- enforce maximum total serialized size;
- reject or truncate oversized payloads deterministically;
- replace binary and Base64-like values with safe metadata;
- preserve enough typed context for diagnosis;
- never fail the main workflow because logging failed;
- emit a stable redaction/truncation indicator.

Unknown model/provider pricing must produce:

```text
cost = null
warning = UNKNOWN_PRICE
```

It must never silently calculate zero cost.

Aggregate costs by:

- stage;
- attempt;
- lesson;
- locale;
- batch;
- completed video.

## Required R-010 tests

Add tests for:

- context completeness on success;
- context completeness on failure;
- retry and attempt history;
- stable error categories;
- duration fields;
- cache hit/miss/invalidation;
- known cost;
- unknown price;
- per-video aggregation;
- API key redaction;
- authorization-header redaction;
- cookie redaction;
- URL secret redaction;
- nested token redaction;
- environment object rejection;
- Base64 image/audio/video redaction;
- Buffer, ArrayBuffer, typed-array, and stream metadata handling;
- oversized strings;
- oversized objects;
- excessive nesting;
- logger failure not masking the production result.

Run focused tests and affected-package typechecks. Then adversarially attack the logger with nested and disguised secrets before accepting R-010.

---

# Phase 3 — Complete R-011 release and compatibility gates

Implement the complete approved test matrix and establish a truthful green baseline.

Do not blindly repair all repository failures.

First classify every failure as:

- introduced by mathematics work;
- exposed by mathematics work;
- pre-existing and unrelated;
- environment/setup;
- nondeterministic;
- unknown.

For every failure include:

- exact command;
- exact test/file;
- baseline evidence;
- owning package;
- classification;
- whether repair is authorized by R-011.

Do not weaken existing assertions or broadly rewrite unrelated story/horror behavior.

## Required mathematics gates

The documented clean environment must pass:

- mathematics domain unit tests;
- curriculum and DAG tests;
- verifier Python tests;
- TypeScript/Python boundary integration;
- localization and fact-lock tests;
- workflow, resume, invalidation, and batch tests;
- rendering unit tests;
- local Remotion/FFmpeg integration;
- metadata and thumbnail tests;
- publish dry-run tests;
- CLI tests;
- observability/redaction tests;
- pilot E2E prerequisites;
- affected package typechecks.

Implement all missing approved matrix cases, including regressions discovered during R-001 through R-010.

## Required story/horror compatibility gates

Verify at minimum:

- story CLI help and registration;
- configuration defaults;
- speech behavior;
- YouTube upload wrapper behavior;
- thumbnail characterization;
- package dependency direction;
- existing semantic exit behavior;
- no story package depends on mathematics;
- no horror default changed;
- no math command intercepts an existing command.

The relevant H01–H04 tests from the approved matrix must pass.

## Repository-level gates

Run according to `AGENTS.md` and the approved verification budget:

- targeted format checks for changed files;
- targeted lint for changed files;
- affected package typechecks;
- focused unit and integration tests;
- packaged CLI characterization;
- build where required;
- broader unit/integration gates only when permitted by repository guidance.

A repository-wide failure may be formally quarantined only when all of the following are recorded:

- exact failing command and test;
- proof it predates or is unrelated to the mathematics diff;
- responsible package or owner;
- explicit expiry or follow-up;
- reason it does not invalidate the mathematics pilot;
- no mathematics production path depends on the failing behavior.

Do not use quarantine for a mathematics-owned failure, an unknown failure, or a failure affecting a shared production boundary used by mathematics.

After the gates pass, run an adversarial source review for regressions in shared CLI, upload, rendering, config, and observability code.

---

# Phase 4 — Complete R-012 provider-free offline pilot

Run a complete provider-free vertical slice for:

```text
M5-ZO-001-standard-de
```

Use:

- an explicit temporary workspace;
- deterministic local fixtures;
- the locked local Python verifier environment;
- mock TTS;
- local deterministic rendering;
- no credentials;
- no external network;
- no paid provider;
- no upload or publication.

The pilot must exercise the actual production CLI and package exports.

## Required pilot stages

The vertical slice must prove:

1. curriculum release loading;
2. provenance validation;
3. prerequisite DAG validation;
4. skill and variant selection;
5. genuine lesson specification;
6. exact mathematical specification;
7. independent verifier execution;
8. canonical German narration;
9. locked-fact localization artifacts;
10. post-localization verification;
11. scene and visual plan;
12. mock TTS;
13. deterministic timing reflow;
14. formula and semantic diagram assets;
15. teacher asset integration;
16. synchronized Remotion render;
17. FFmpeg media QA;
18. deterministic thumbnail;
19. localized metadata;
20. playlist resolution;
21. complete quality evidence;
22. derived quality status `READY`;
23. render/publish permissions derived from authoritative evidence;
24. safe publish dry-run;
25. zero live client construction;
26. zero network/provider mutation;
27. complete telemetry and redaction evidence;
28. persistent workflow and batch state.

The generated video must satisfy the approved profile, including:

- 1920×1080;
- 30 fps;
- 180–300 seconds inclusive;
- audio and video streams;
- valid packet continuity;
- corruption scan;
- narration/frame synchronization;
- teacher presence constraints;
- safe-area/readability constraints.

Do not commit binary pilot media.

## Required pilot negative paths

Run focused E2E negatives for:

- deleted output followed by resume;
- truncated output followed by resume;
- content-hash mismatch;
- swapped artifact;
- missing diagram;
- verifier failure;
- unsupported critical verifier result;
- localization fact mismatch;
- thumbnail fact mismatch;
- corrupt media;
- interrupted workflow;
- interrupted batch after one completed item;
- retryable failure;
- permanent failure;
- blocked dependent with independent item continuing;
- publish dry-run with blocked quality;
- attempted provider/network dispatch;
- attempted path or symlink escape.

Confirm only the earliest invalid stage and its transitive dependants rerun.

Confirm unaffected upstream stages and independent batch items remain cached.

## Second-run cache proof

Run the same complete pilot a second time without changing inputs.

The second run must:

- validate every reused artifact;
- perform zero provider calls;
- perform zero verifier reruns unless explicitly designed as non-cacheable;
- perform zero TTS regeneration;
- perform zero SVG regeneration;
- perform zero render;
- perform zero metadata/thumbnail regeneration;
- perform zero publish mutations;
- report cache hits truthfully;
- reject any missing, stale, corrupt, or hash-invalid artifact instead of treating it as cached success.

Record exact hashes and stage decisions.

## Final rollout gate

Confirm:

- all required mathematics gates are green;
- all required story/horror compatibility gates are green;
- no Critical or High audit finding remains open;
- R-001 through R-012 have truthful statuses;
- no paid provider credential or live publish path is reachable from the pilot command;
- the mathematics rollout feature flag defaults to disabled;
- disabling the flag stops mathematics dispatch and publish immediately;
- published/accepted release IDs remain immutable;
- no automatic deletion of generated or published media exists.

Do not privately batch the 37 class-5 lessons and do not enable publishing in this task. The pilot proves readiness; it does not authorize rollout.

---

# Test-first and adversarial rules

For every material contract added or changed:

1. Add a positive test.
2. Add a direct negative test.
3. Add an adversarial test.
4. Observe that the adversarial test fails against the pre-repair implementation when practical.
5. Implement the smallest coherent repair.
6. Run the directly affected tests.
7. Attack the repaired boundary again.
8. Add a regression test for every discovered bypass.
9. Verify the package/public/CLI production path rather than only importing source helpers.

Adversarial mutations must include, where relevant:

- missing values;
- extra values;
- duplicated values;
- reordered arrays;
- cross-lesson swaps;
- cross-locale swaps;
- cross-release swaps;
- cross-workflow swaps;
- internally hash-consistent forged artifacts;
- recomputed caller hashes;
- stale parent hashes;
- missing or alternative parent chains;
- wrong owning stage;
- wrong producer;
- valid artifact absent from the authoritative manifest;
- path traversal;
- symlink escape;
- stale cache;
- truncated files;
- arbitrary binary bytes;
- unbound status or approval values;
- partial operation reports;
- interrupted processes;
- untrusted logs and disguised secrets.

Do not generate another follow-up repair prompt for defects you can repair safely within this scope.

---

# Verification discipline

Follow `AGENTS.md` verification limits.

Prefer:

1. directly affected focused test file;
2. exact failing test name when repairing;
3. affected package typecheck;
4. production-entry-point integration;
5. task acceptance gate;
6. broader release gates only during R-011/R-012.

Classify every failure before editing.

Do not:

- weaken assertions;
- remove adversarial tests;
- change expected failure into success without a contract change;
- regenerate opaque fixtures;
- update snapshots broadly;
- hide failures behind `skip`, `todo`, catch-all exception handling, permissive schema parsing, or type assertions;
- edit `dist` to mask source/package resolution problems.

If a command fails only because of a documented sandbox restriction, retry the unchanged command through the permitted host-access mechanism. Do not edit production code to accommodate a sandbox-only failure.

If a genuinely expensive render is necessary, execute it only when required to prove changed pixel, timing, muxing, or media-QA behavior. Do not rerun an expensive unchanged proof merely to duplicate historical evidence.

---

# Documentation and status updates

Update:

- `docs/mathe/audits/remediation-backlog.md`
- the mathematics implementation report
- concise task reports under `docs/reports/codex-runs/`
- any required clean-environment or CI documentation
- the generated documentation manifest only when its source contract requires it

For every remediation task record:

- initial status;
- exact production files changed;
- exact test files changed;
- requirement-to-test mapping;
- adversarial attacks attempted;
- exact commands and exit codes;
- production path exercised;
- anything not executed;
- remaining risks;
- current commit hash;
- final decision.

Do not mark a task accepted when a material acceptance criterion remains unsupported.

Do not claim “all tests pass” when only focused tests were executed.

Keep reports concise and evidence-based.

---

# Final completion report

At the end, provide one final report containing:

## Repository state

- starting commit;
- ending commit;
- branch;
- tracked changes;
- untracked changes;
- unrelated changes preserved.

## Remediation decisions

For R-009 through R-012:

- status;
- implemented behavior;
- acceptance evidence;
- remaining limitation.

## Verification

For every command:

- exact command;
- exit code;
- relevant test count;
- duration when available;
- classification of any failure.

## Production proof

State exactly which real entry points were exercised:

- package exports;
- CLI;
- workflow/artifact loader;
- verifier worker;
- local renderer;
- FFmpeg;
- metadata/thumbnail;
- publish dry-run;
- telemetry.

## Safety proof

Confirm:

- no paid provider call;
- no network dispatch;
- no live client construction;
- no publication;
- no credential use;
- no generated media committed;
- no horror fallback;
- no unrelated worktree cleanup.

## Final verdict

Use exactly one:

- `IMPLEMENTATION_COMPLETE_OFFLINE_PILOT_ACCEPTED`
- `IMPLEMENTATION_COMPLETE_PENDING_INDEPENDENT_ACCEPTANCE`
- `IMPLEMENTATION_INCOMPLETE`

Use `IMPLEMENTATION_COMPLETE_OFFLINE_PILOT_ACCEPTED` only when R-009 through R-012 and every required gate are supported by fresh evidence.

For an incomplete verdict, list the exact remaining blocker, owning module, failing command, and smallest safe next action. Do not produce a generic repair prompt in place of doing work that remains achievable in the current run.
