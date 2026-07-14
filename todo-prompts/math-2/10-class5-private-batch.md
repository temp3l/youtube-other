# M2-010: Produce the 37-lesson German Class 5 private batch

Produce all 37 Class 5 skills as German `standard` private lesson videos through the
canonical workflow. This is a production operation with potentially paid speech calls.
Planning and provider-free validation are always allowed; paid execution requires explicit
approval in the current user instruction.

## Dependency

M2-009 must be accepted, including the three representative content families, cache/resume
behavior, and private media quality. Verify current Git state and all 37 capability/review
records before planning the batch.

## Preflight

1. Load the reviewed Class 5 release and derive the stable topological order. Do not use a
   caller-supplied list as curriculum authority.
2. Confirm exactly 37 unique `M5-*` skills, each with a reviewed German standard lesson
   specification and supported verifier v3 checks.
3. Run a side-effect-free batch plan and record task counts, cache hits/misses, provider
   calls, expected audio characters/duration, cost ceiling, concurrency, rate limits,
   retries, disk requirements, and output workspace.
4. Confirm output is private and live publishing is unavailable.
5. Confirm the selected workspace is contained, writable, separate from tracked source,
   and does not collide with an earlier release or locale.
6. Recheck current provider credentials/configuration without printing secrets.

If paid-provider approval is not explicit in the current instruction, stop after preflight
with status `READY_FOR_PRIVATE_BATCH`, preserve the plan, and state the exact approval and
cost ceiling required. Do not submit calls based on approval from an old report.

## Execution

When explicitly approved:

- Use the canonical batch/operator path, not a custom loop or direct provider shortcut.
- Pin release, profile, verifier, speech, renderer, visual-style, and metadata versions.
- Use bounded concurrency and rate limits from configuration. Never raise them merely to
  finish faster.
- Reuse validated cached artifacts and make only planned uncached provider calls.
- Process each `(skill, standard, de)` item independently with durable attempts, bounded
  retries, cancellation, interruption recovery, and partial-success reporting.
- Block downstream work for a failed item without stopping unrelated lessons.
- Validate audio before timing/render, media before quality, and quality before metadata or
  publish dry-run.
- Retain failure evidence without secrets or provider payload dumps.
- Generate private metadata/thumbnails and zero-mutation publish-dry-run evidence. A
  placeholder artwork blocker is acceptable for this private milestone but must remain a
  public-release blocker.
- Do not upload, publish, mutate playlists, change privacy remotely, or use channel OAuth.

## Batch acceptance checks

- Exactly 37 successful canonical items and no duplicate lesson identity.
- Output order matches the reviewed DAG with stable seed-order tie breaking.
- Each lesson has reviewed curriculum/profile evidence, verifier-bound facts, German
  narration, valid audio/timing, semantic visuals, 1920x1080 private media, quality report,
  metadata, and publish dry-run evidence.
- Every final binary matches its manifest hash and byte length.
- No item has `failed`, `unsupported`, stale, unresolved minor approval, or public-ready
  status derived from placeholder assets.
- A second batch run performs zero paid calls and rewrites no valid successful artifacts.
- A controlled interrupted/resumed run preserves successes and continues only incomplete
  work.
- Provider cost and request counts reconcile exactly with durable telemetry.

## Failure handling

Do not weaken assertions or regenerate broad fixtures to clear a failed item. Classify each
failure as production defect, content/review defect, provider/transient failure, invalid
artifact, environment limitation, or unrelated pre-existing failure. Repair code only with
a focused regression test and within the `AGENTS.md` budget. Never silently omit a skill.

## Reporting

Create the required Codex-run report with the release hash, ordered skill list, exact batch
command, workspace, success/failure/cache counts, provider calls and cost, media validation,
zero-mutation evidence, repairs, and unresolved items. Do not commit generated media or
credentials. Do not commit source changes unless requested.
