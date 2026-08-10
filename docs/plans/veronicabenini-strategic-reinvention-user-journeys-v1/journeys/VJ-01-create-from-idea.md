# VJ-01 — Create an Episode from an Idea

## Primary actor
Creator / Channel Owner

## Trigger
The creator has a topic, concept, question, or title but no prepared source pack.

## Main flow
1. Creator creates a new Veronica Benini episode.
2. Creator enters a working title, topic, target duration, target language, and optional editorial notes.
3. System applies versioned Veronica genre defaults.
4. System creates a canonical episode revision in `draft`.
5. Production agent derives an initial story structure and identifies information gaps.
6. Creator can add or attach source material before production continues.
7. System creates narration, visual-plan, and production tasks only after the canonical revision is frozen for the run.
8. Creator reviews the resulting approval pack.
9. Approved revision becomes eligible for rendering/publishing.

## Alternate flows
- Creator starts with only a title: system proposes structure but marks unsupported details as needing source/context.
- Creator adds source material after initial story generation: only source-dependent downstream artifacts are invalidated.
- Creator clones a prior episode: shared genre configuration is inherited; episode-specific assets are not silently reused unless compatible.

## Success outcome
A traceable approved episode revision exists with narration, visuals, audio, render metadata, and provenance.

## Failure expectations
- No silent overwrite of an approved revision.
- No paid generation step before required configuration/credentials are validated.
- Retrying episode creation does not create duplicates.
