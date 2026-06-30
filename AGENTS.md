# AGENTS

Use this repo as a `pnpm` monorepo with `apps/cli` as the primary operational surface. Inspect code before changing docs or behavior. Prefer `rg` and targeted file reads over broad scans.

Repository inspection rules:

- Ignore the root `README.md` for architecture guidance.
- Treat source code as authoritative when docs conflict.
- Read only the docs relevant to the current task; do not preload the full docs set.
- Ignore docs.bak
- Exclude large generated trees from routine search: `node_modules/`, `dist/`, `coverage/`, `episodes/**/output/`, `episodes/**/state/`, `episodes/**/generated-assets/`, `audio/`, `video/`, `images/`, `transcripts/`, `logs/`.

Execution and validation:

- Default to narrow, file-targeted validation.
- Prefer filtered Vitest, single-file ESLint, and path-existence checks over repo-wide runs.
- Do not default to `pnpm build`, `pnpm test`, full lint, or full typecheck for docs-only work.
- If validation fails, repair and retry at most two times, then report the remaining issue clearly.

Cost- and Time-Bounded Verification:

- Run the directly affected test file first, then narrow further with an exact test-name filter only when debugging one failure.
- Inspect scripts and Vitest config before choosing a command, and confirm wrappers honor file filters before trusting them.
- Prefer `pnpm test:focused -- <test-file>` or direct `pnpm exec vitest run -c <config> --bail=1 <test-file>` when broader wrappers would fan out.
- Do not run repository-wide tests, builds, snapshot updates, or fixture regeneration unless the human explicitly authorizes broad verification for the active task.
- Stay within one implementation-context budget: at most three distinct test commands, at most two repair reruns of the same failing command, no rerun of an unchanged failing command, and at most one affected-package typecheck after focused tests pass.
- Stop test repair when the same focused failure survives two targeted fixes, more than three fixtures appear to need edits, assertions would need to be weakened, or a broad command exposes unrelated failures.
- Classify fixture failures before editing them: production defect, intentional contract change, stale fixture from that contract change, or unrelated pre-existing failure. Only change fixtures for intentional approved contract changes.
- When the budget is exhausted or failures stop converging, report the exact command, exact test name, concise failure, classification, likely owning module, and smallest follow-up instead of continuing to experiment.
- Prefer semantic assertions over full-object snapshots and avoid broad snapshot or fixture regeneration.
- Keep the root policy concise here and use `docs/development/codex-verification-guardrails.md` for command examples, retry limits, fixture policy, and hook details.

Progress and completion output:

- State what you are inspecting before substantial work.
- Before edits, say which files you are changing and why.
- On completion, summarize the behavior or docs changed, note validation run, and call out anything not verified.

Documentation update policy:

- Update docs only when a task changes documented architecture, commands, configuration, or behavior.
- If a task does not change those surfaces, leave docs alone.

Documentation index:

- [Docs Index](docs/README.md)
- [System Overview](docs/architecture/system-overview.md)
- [Episode Production Pipeline](docs/architecture/episode-production-pipeline.md)
- [Story Localization](docs/architecture/story-localization.md)
- [Media Assets And Delivery](docs/architecture/media-assets-and-delivery.md)

Media pipeline documentation:

- Only load these docs for media-generation and media-pipeline tasks.
- [Media Implementation Inventory](docs/architecture/media-implementation-inventory.md)
- [Target Media Architecture](docs/architecture/target-media-architecture.md)
- [Media Consolidation Plan](docs/migrations/media-consolidation-plan.md)
- Treat source code and tests as authoritative if these docs conflict with code.
- Read only the relevant document for the task; do not preload the full set.
