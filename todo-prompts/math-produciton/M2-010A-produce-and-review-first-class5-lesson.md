      # M2-010A: Produce and review only the first German Class 5 lesson

      Produce **exactly one** German `standard` private lesson video: the first eligible
      `M5-*` skill in the canonical, reviewed Class 5 curriculum DAG. After production,
      perform a complete acceptance review of that lesson.

      Do not produce, queue, reserve, render, or invoke providers for the remaining
      36 skills.

      This operation may use paid providers. Planning and provider-free checks are
      always allowed. Paid execution is permitted only when the current operator
      instruction explicitly:

      1. approves paid production of this one lesson; and
      2. states a hard maximum provider-cost ceiling.

      Do not reuse approval from an earlier prompt, report, or run.

      ## Final statuses

      Finish with exactly one of:

      - `ACCEPTED_PRIVATE_SINGLE_LESSON`
      - `READY_FOR_PRIVATE_SINGLE_LESSON`
      - `BLOCKED_CONTENT_OR_REVIEW`
      - `BLOCKED_ENVIRONMENT`
      - `FAILED_PRODUCTION`

      ## Dependency

      M2-009 must be accepted, including:

      - all three representative content families;
      - canonical workflow behavior;
      - cache and resume behavior;
      - private media quality;
      - provider telemetry;
      - zero-mutation publish-dry-run behavior.

      Verify the current Git state and confirm that M2-009's bound hashes and evidence
      still match the repository. Do not rely only on a historical report.

      ## Select the lesson canonically

      1. Load the reviewed Class 5 release from repository authority.
      2. Derive the stable topological order using the canonical implementation and
         configured seed-order tie breaking.
      3. Confirm exactly 37 unique `M5-*` skills.
      4. Select the first skill in that derived order.
      5. Record:
         - release identity and hash;
         - complete ordered list of all 37 skill IDs;
         - selected first skill and why it is first;
         - reviewed prerequisites;
         - lesson-specification and review-record hashes;
         - profile, verifier, renderer, speech, visual-style, and metadata versions.
      6. Do not use a caller-supplied skill ID as curriculum authority.
      7. Do not silently select a later skill when the first one is blocked.

      If the first skill lacks a valid review record, supported verifier v3 checks, or
      canonical production capability, stop with `BLOCKED_CONTENT_OR_REVIEW`.

      ## Preflight

      Before any paid call:

      1. Confirm exactly one planned item:
         `(selected-first-skill, standard, de)`.
      2. Confirm no duplicate lesson identity.
      3. Run the canonical side-effect-free plan.
      4. Record:
         - exact canonical command;
         - task graph and counts;
         - cache hits and misses;
         - planned provider calls;
         - expected speech characters and duration;
         - estimated cost and approved hard ceiling;
         - configured concurrency, rate limits, retries, and backoff;
         - disk requirement and output workspace;
         - every pinned version.
      5. Confirm the workspace is:
         - writable;
         - under the configured generated-artifact root;
         - separate from tracked source;
         - collision-free for release, locale, profile, skill, and attempt.
      6. Confirm all output is private.
      7. Confirm live publishing and remote mutations are unavailable.
      8. Recheck provider credentials without printing or persisting secrets.
      9. Confirm the other 36 lessons have zero planned calls and mutations.

      ### Paid execution gate

      When current approval or a hard cost ceiling is missing:

      - stop after preflight;
      - persist the plan;
      - return `READY_FOR_PRIVATE_SINGLE_LESSON`;
      - state the selected skill;
      - state the estimated provider cost;
      - state the exact approval wording and sufficient ceiling required;
      - make zero paid calls.

      ## Execution

      After valid current approval:

      1. Use the canonical batch/operator path with an exact one-item limit.
      2. Do not use a custom loop or direct provider shortcut.
      3. Pin every version recorded at preflight.
      4. Abort before submission when the executable plan differs materially from the
         approved plan or can exceed the approved ceiling.
      5. Reuse only validated compatible cached artifacts.
      6. Submit only the planned uncached provider calls.
      7. Keep configured bounded concurrency and rate limits.
      8. Use durable attempt identity, bounded retries, cancellation, and recovery.
      9. Validate each stage before downstream work:
         - curriculum and review evidence;
         - verifier-bound facts;
         - German narration input;
         - generated audio;
         - timing;
         - rendered media;
         - quality;
         - metadata and thumbnail;
         - zero-mutation publish dry run.
      10. Retain sanitized failure evidence without secrets or provider payload dumps.
      11. Do not upload, publish, mutate playlists, change remote privacy, use channel
         OAuth, or call a live channel API.
      12. A placeholder-artwork exception is allowed only when the existing private
         milestone contract explicitly permits it. It must remain a public blocker.

      ## Required outputs

      The one lesson must contain:

      - immutable lesson identity;
      - release/profile/content/review/verifier provenance;
      - German `standard` narration;
      - validated audio and timing;
      - semantic visuals;
      - valid 1920×1080 private video;
      - media-probe evidence;
      - quality report;
      - private metadata and thumbnail;
      - zero-mutation publish-dry-run evidence;
      - artifact manifest with SHA-256 and byte length for every final binary;
      - telemetry for cache decisions, provider calls, characters, duration, retries,
      latency, and cost.

      Do not commit generated media or credentials.

      ## Independent lesson review

      Do not treat pipeline success as acceptance.

      ### Curriculum and mathematics

      Confirm:

      - this is the first skill in the reviewed DAG;
      - objective, prerequisites, example, transfer task, misconception, formative
      checks, and scene purposes match the exact reviewed specification;
      - all displayed and narrated mathematical claims are correct;
      - no stale, deferred, unsupported, or unreviewed content appears;
      - terminology and notation are appropriate German for the target learners.

      ### Narration and audio

      Confirm:

      - narration is German and uses the pinned speech profile;
      - no text is missing, duplicated, truncated, or malformed;
      - numbers, operators, symbols, and mathematical terms are pronounced correctly;
      - pacing, silence, loudness, clipping, and duration meet the private-quality
      contract;
      - all configured audio probes pass.

      ### Visuals and media

      Confirm:

      - visuals are semantically bound to reviewed facts;
      - all values, labels, units, operators, and solution steps are correct;
      - every scene remains readable long enough;
      - no visual implies a false mathematical statement;
      - output is exactly 1920×1080;
      - codec, container, duration, frame rate, and audio stream pass validation;
      - there are no black frames, missing assets, broken text, severe clipping, or
      unapproved placeholder leakage.

      ### Privacy and integrity

      Confirm:

      - output remains private;
      - publish dry run caused zero remote mutations;
      - no upload, playlist change, privacy change, OAuth use, or channel call occurred;
      - public-ready status is not derived from placeholder assets;
      - every binary matches its manifest SHA-256 and byte length;
      - provider requests, characters, retries, cache decisions, and cost reconcile;
      - actual cost does not exceed the approved ceiling;
      - no secret or raw provider payload is retained.

      ## Cache and resume verification

      After the successful production run:

      1. Run the exact same canonical command again.
      2. Require:
         - zero paid calls;
         - zero rewrites of valid artifacts;
         - complete validated cache reuse;
         - unchanged final hashes and byte lengths.
      3. Run the canonical provider-free interruption/resume test or simulation.
      4. Do not destroy paid artifacts merely to test resume.
      5. Require successful artifacts to remain untouched and only the incomplete
         simulated stage to continue.

      Any failure blocks acceptance.

      ## Acceptance criteria

      Return `ACCEPTED_PRIVATE_SINGLE_LESSON` only when:

      - exactly one canonical item succeeded;
      - it is the first reviewed skill in stable DAG order;
      - none of the other 36 lessons was produced or caused a provider call;
      - reviewed provenance and verifier v3 support are complete;
      - narration, audio, timing, visuals, media, quality, metadata, thumbnail, and
      publish-dry-run evidence pass;
      - manifest hashes and byte lengths match;
      - no failed, unsupported, stale, unresolved, or falsely public-ready status
      remains;
      - the identical second run makes zero paid calls and rewrites nothing;
      - interruption/resume verification passes;
      - provider counts and costs reconcile exactly;
      - no production, content, review, privacy, or integrity blocker remains.

      ## Failure handling

      Do not weaken assertions, bypass canonical gates, regenerate broad fixtures, or
      silently replace the selected skill.

      Classify every failure as exactly one of:

      - `PRODUCTION_DEFECT`
      - `CONTENT_OR_REVIEW_DEFECT`
      - `PROVIDER_TRANSIENT_FAILURE`
      - `INVALID_ARTIFACT`
      - `ENVIRONMENT_LIMITATION`
      - `UNRELATED_PRE_EXISTING_FAILURE`

      For a production repair:

      - make the smallest focused change;
      - add a focused regression test;
      - remain within `AGENTS.md` scope and budget;
      - run the narrowest relevant verification;
      - report every source modification.

      ## Report

      Create the required Codex-run report with:

      - final status;
      - Git commit and dirty-state summary;
      - M2-009 evidence verification;
      - release identity and hash;
      - full stable order of all 37 skills;
      - selected first skill and selection rationale;
      - lesson/content/review/profile/verifier hashes;
      - exact preflight and execution commands;
      - approved cost ceiling;
      - workspace;
      - planned and actual task counts;
      - cache hits and misses;
      - provider calls, characters, retries, latency, and cost;
      - artifact paths;
      - audio, media, quality, privacy, and integrity results;
      - zero-call second-run evidence;
      - interruption/resume evidence;
      - zero-mutation evidence;
      - repairs and regression tests;
      - unresolved blockers;
      - confirmation that the other 36 skills had zero calls and mutations.

      Do not commit generated media or credentials. Do not commit source changes unless
      the current operator instruction explicitly requests a commit.
