# Math genre planning

Date: 2026-07-12

## Changed files

- `docs/mathe/plans/math-genre-implementation-plan.md`
- `docs/mathe/plans/math-genre-task-breakdown.md`
- `docs/mathe/plans/math-genre-risk-register.md`
- `docs/mathe/plans/math-genre-test-matrix.md`
- `docs/reports/codex-runs/2026-07-12-math-genre-planning.md`

## Summary

Created a repository-grounded, decision-complete plan for a separate multilingual mathematics education pipeline. The plan covers curriculum provenance/versioning, typed exact mathematics, independent SymPy verification, locked localization, deterministic visuals, TTS/timing, Remotion/FFmpeg, resilient orchestration, quality, metadata/playlists, publishing, compatibility, rollout and rollback. No production code or generated assets changed.

## Tests/checks

- Parsed the curriculum JSON block with Node: 206 skills; grade counts 37/34/36/36/33/30.
- `git diff --check -- docs/mathe/plans`: passed.
- Required-file and required-topic presence checks: passed.

## Risks remaining

Implementation is unverified. Remotion is not currently installed; KaTeX is only transitive. Math channel credentials, playlist IDs, teacher assets, curriculum edge reviews and `madeForKids` policy remain external prerequisites.

## Follow-up

Implement tasks T01–T28 in dependency order, beginning with schemas/configuration and offline curriculum validation.
