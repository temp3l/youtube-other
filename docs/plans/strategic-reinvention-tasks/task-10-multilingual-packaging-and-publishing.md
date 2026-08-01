# Task 10: Multilingual Packaging And Publishing Safety

## Objective

Produce an auditable multilingual package and publish only through exact approval, capability, dedupe, and reconciliation gates.

## Dependencies And Parallelism

Depends on Tasks 05, 08, and 09. Sequential irreversible-boundary task.

## Exclusive Ownership

- new `packages/youtube-upload/src/multilingual-audio-capability.ts` and test
- `packages/youtube-upload/src/publish-approval.ts`
- `packages/youtube-upload/src/generic-media-publish.ts`
- `packages/youtube-upload/src/publication-reconciliation.ts`
- strategic routing in `packages/youtube-upload/src/index.ts` and CLI upload composition assigned by lead

## Required Behavior

- Package master video, canonical/localized audio, subtitles, metadata, thumbnail text, CTA, and an audio-track manifest.
- Report supported/unsupported/unknown alternate-audio capability without claiming unsupported API behavior.
- Require current rights, render, metadata, locale/audio scope, campaign, channel, and publish approval fingerprints.
- Keep `autoPublish` and notification defaults false.
- Persist intent/checkpoints before effects; reconcile uncertain provider outcomes before retry.
- Forbid silent fallback to separate public videos and forbid the legacy uploader for this profile.

## Verification

```bash
pnpm test:focused -- packages/youtube-upload/src/multilingual-audio-capability.unit.test.ts
pnpm test:focused -- packages/youtube-upload/src/generic-media-publish.unit.test.ts
pnpm test:focused -- packages/youtube-upload/src/publication-reconciliation.unit.test.ts
```

## Acceptance

Mocks prove missing/stale evidence blocks, partial progress resumes with zero duplicate successful mutations, and ambiguous upload results become reconciliation-required rather than retried.

Lead checkpoint: `fix(publish): enforce strategic approval and reconciliation`.
