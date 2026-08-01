# Task 05: Cut Over YouTube Publishing

## Objective

Replace the active legacy uploader with the approval-bound, checkpointed generic
publisher without changing public CLI semantics unexpectedly.

## Scope

The `youtube upload` CLI boundary, `uploadYoutubeEpisode`,
`publishYoutubeMedia`, approval artifacts, mutation checkpoints,
reconciliation, reports, and operator documentation.

## Procedure

1. Characterize current arguments, output, exit codes, playlist behavior,
   retry behavior, and upload-report locations.
2. Map episode media and metadata to the generic publisher contract through one
   compatibility caller adapter.
3. Require an approval bound to media/metadata hashes and a successful dry-run.
4. Persist a checkpoint after each irreversible provider mutation and require
   reconciliation for ambiguous outcomes before retry.
5. Preserve CLI output compatibility during one support window, then deprecate
   direct `uploadYoutubeEpisode` access.
6. Remove the legacy mutation sequence only after packaged CLI callers delegate.

## Validation

- Unit tests use mocked YouTube clients; they cover resume, duplicate avoidance,
  ambiguous results, playlist failure, and approval mismatch.
- Real upload or playlist mutation is excluded unless explicitly authorized by
  a human.

## Completion gate

The CLI invokes one approval-bound publishing authority, every irreversible
operation is reconcilable, and no production caller reaches the legacy uploader.
