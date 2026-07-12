# Codex Prompt: Mathematik-Genre planen

Use **Plan Mode**. Do not implement production code in this run.

You are working in an existing production-critical TypeScript media-generation repository.
Create a complete, repository-grounded implementation plan for a new mathematics education
genre. The curriculum and requirements are stored under `docs/mathe/`.

## Read first

Read every Markdown file under:

- `docs/mathe/curriculum/`
- `docs/mathe/sources/`
- `docs/mathe/architecture/`
- `docs/mathe/product/`

## Product constraints

- Separate education brand.
- Channels and languages: `de`, `en`, `es`, `fr`, `pt`.
- German Gemeinschaftsschule classes 5–10 are canonical.
- One narrow skill per 3–5 minute 16:9 video.
- Three variants: foundation, standard, challenge.
- Same mathematical facts, learning objective and scene function in every language.
- Voice-over with animated formulas and diagrams.
- Reusable digital-classroom teacher character.
- Full metadata and playlist assignment.
- Independent deterministic verification of every calculation.
- Initial rollout: German, class 5, standard variant first.
- No worksheets or separate quizzes in phase one.

## Mandatory repository discovery

Before proposing architecture:

1. Inspect the repository tree, package manifests, workspaces, TypeScript configuration,
   build system and test commands.
2. Locate existing genre abstractions, episode models, CLI commands, batch orchestration,
   provider adapters, prompt registry, caching, simulation mode, debug logging, production
   state, TTS, image generation, rendering, metadata, playlists and publishing.
3. Identify hard-coded horror assumptions and global defaults.
4. Verify every file path and API referenced in the plan.
5. Prefer adapting existing functionality over creating a parallel framework.

## Required design

Plan this typed pipeline:

```text
curriculum import
-> source and schema validation
-> prerequisite graph
-> lesson variant specification
-> exact mathematical specification
-> independent SymPy verification
-> canonical German narration
-> scene and timing plan
-> locked-fact localization
-> formula and diagram assets
-> TTS
-> Remotion/FFmpeg rendering
-> metadata/playlists
-> quality gate
-> publishing
```

## Plan requirements

The plan must define:

- source registry and curriculum versioning
- normalized skill schema and state overrides
- stable IDs and migration policy
- prerequisite DAG generation and review
- lesson variant model
- expression and exact-value AST
- versioned SymPy JSON protocol and TypeScript adapter
- localization locks and glossaries
- formula/diagram component library
- classes 5–7 and 8–10 presentation profiles
- teacher asset strategy
- narration-to-scene synchronization
- idempotent and resumable stages
- batch behavior that continues unrelated work after an item failure
- quality status machine
- simulation and dry-run behavior
- structured logs, metrics and cost tracking
- metadata, thumbnail and playlist generation
- backward compatibility with the horror pipeline
- test pyramid and fixture strategy
- rollout and rollback plan

## Deliverables

Create:

- `docs/mathe/plans/math-genre-implementation-plan.md`
- `docs/mathe/plans/math-genre-task-breakdown.md`
- `docs/mathe/plans/math-genre-risk-register.md`
- `docs/mathe/plans/math-genre-test-matrix.md`

The task breakdown must use small, dependency-ordered tasks with explicit acceptance criteria,
expected files, tests, migration impact and rollback notes.

Do not implement code. Do not make paid provider calls. Run only safe discovery commands and
existing read-only validation commands.
