# M2-009: Accept a three-skill private production pilot

Run and accept a canonical private pilot for one Class 5 lesson from each implemented
content family:

- `M5-ZO-001`, `standard`, `de`
- `M5-GM-002`, `standard`, `de`
- `M5-DZ-001`, `standard`, `de`

Do not upload or publicly publish anything.

## Dependencies

M2-003 through M2-008 must be accepted. Verify their claims against current source and
reports before running the pilot. If curriculum or lesson review evidence is missing, stop
without bypassing readiness.

## Safety and workspace

- Record branch, `HEAD`, dirty files, tool versions, and relevant package state.
- Use a new explicit temporary workspace outside tracked episode and generated-asset trees.
- Do not clean, reset, overwrite, or adopt unrelated worktree changes.
- Begin with mock/provider-free speech and local rendering.
- A real speech call requires explicit approval in the current user instruction, a bounded
  cost estimate, configured credentials, and confirmation that no cached valid artifact
  exists. Absence of approval is a stop condition, not permission to guess.
- Never use YouTube credentials, call an upload API, assign a playlist, or mutate a channel.

## Pilot sequence

Discover the current canonical CLI syntax rather than copying historical commands. For
each lesson:

1. Validate curriculum/profile readiness and produce a dry-run plan with zero side effects.
2. Run the canonical workflow through reviewed lesson specification, verifier v3, German
   narration, timing, semantic visuals, mock speech, local render, quality, metadata,
   thumbnail, and publish dry-run.
3. Verify every artifact schema, identity, content hash, parent fingerprint, producer,
   byte length, contained path, and workflow ownership.
4. Probe final media locally for H.264 video, supported audio, 1920x1080 dimensions,
   duration, frame rate, caption behavior, and decodability.
5. Confirm mathematical facts and visible claims against verifier evidence.
6. Confirm private/simulation artwork remains explicitly blocked from public publishing.
7. Run the same command again and prove valid stages are cache hits with no provider calls
   and no rewritten successful artifacts.

Then exercise one interruption/resume case, one corrupted intermediate artifact, one
stale profile or release revision, one verifier failure, and one renderer failure. Only
affected descendants may rerun; independent completed lessons must remain intact.

If explicit paid-provider approval is present, replace mock speech for only these three
lessons, validate and promote the real audio, reflow timing, rerender private media, and
record actual cost. Do not generate alternate candidates unless the approved plan includes
them. Do not perform any network operation beyond the specifically approved speech calls.

## Repair policy

When the pilot exposes a production defect, add a focused regression test and make the
smallest coherent repair within the `AGENTS.md` verification budget. Do not weaken gates,
rewrite fixtures broadly, or continue after a repeated non-converging failure. Report a
stale fixture separately from a production defect.

## Acceptance

- All three provider-free workflows complete through zero-mutation publish dry-run.
- Every displayed fact and answer is verifier-bound; no unsupported check passes.
- Media is valid, synchronized, deterministic where required, and private-only.
- Second runs reuse valid artifacts; corruption and revision changes invalidate correctly.
- Provider and mutation telemetry truthfully reports zero unless explicitly approved speech
  calls occurred.
- Story/horror packaged CLI help still starts.
- The Codex-run report includes exact commands, results, artifact workspace, costs, hashes,
  remaining risks, and whether paid speech was authorized. Do not commit unless requested.
