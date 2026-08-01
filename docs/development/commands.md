# Commands

## Root Entrypoints

- `pnpm mediaforge -- <command...>`
- `node apps/cli/dist/index.js <command...>` after building `apps/cli`

## Build and Typecheck

Prefer filtered commands for the app or packages you touched.

- `pnpm --filter @mediaforge/cli build`
- `pnpm --filter @mediaforge/cli typecheck`
- `pnpm --filter @mediaforge/story-localization build`
- `pnpm --filter @mediaforge/story-localization typecheck`
- `pnpm --filter @mediaforge/image-generation build`
- `pnpm --filter @mediaforge/image-generation typecheck`
- `pnpm --filter @mediaforge/rendering build`
- `pnpm --filter @mediaforge/rendering typecheck`
- `pnpm --filter @mediaforge/metadata build`
- `pnpm --filter @mediaforge/metadata typecheck`

## Targeted Tests

Use the root Vitest configs with explicit file paths.

- `pnpm test:unit -- apps/cli/src/index.unit.test.ts`
- `pnpm test:unit -- packages/image-generation/src/image-batch-service.unit.test.ts`
- `pnpm test:integration -- packages/metadata/src/youtube-metadata.integration.test.ts`
- `pnpm test:focused -- apps/cli/src/index.unit.test.ts`

## TypeScript and Vite Tooling

Run repository scripts and test tooling from the workspace root. `tsx`, `vite`,
`vitest`, and `jsdom` are direct root development dependencies, so a fresh
`pnpm install` exposes the command-line tools without relying on optional or
transitive dependencies.

- `pnpm exec tsx <script.ts-or-mjs>`
- `pnpm exec vite --version`
- `pnpm exec vitest --version`

## Targeted Lint

- `pnpm exec eslint apps/cli/src/index.ts`
- `pnpm exec eslint packages/story-localization/src/story-localization.service.ts`

## Useful Scripted CLI Forms

- `pnpm mediaforge -- episode analyze --episode <episode-id>`
- `pnpm mediaforge -- episode plan --episode <episode-id>`
- `pnpm mediaforge -- episode english --episode <episode-id>`
- `pnpm mediaforge -- episode localized --episode <episode-id>`
- `pnpm mediaforge -- episode short --episode <episode-id>`
- `pnpm mediaforge -- audio generate <episode-id>`
- `pnpm mediaforge -- audio generate-localized <episode-id> [--languages en,de] [--dry-run] [--strict]`
- `pnpm mediaforge -- --narration-pipeline-mode shadow audio narration status --episode <episode-id> --language en --variant full --json`
- `pnpm mediaforge -- --narration-pipeline-mode new audio narration prepare --episode <episode-id> --language en --variant full`
- `pnpm mediaforge -- --narration-pipeline-mode new audio narration plan --episode <episode-id> --language en --variant full`
- `pnpm mediaforge -- --narration-pipeline-mode new audio narration generate --episode <episode-id> --language en --variant full [--resume] [--force] [--concurrency 1]`
- `pnpm mediaforge -- --narration-pipeline-mode new audio narration assemble --episode <episode-id> --language en --variant full`
- `pnpm mediaforge -- --narration-pipeline-mode new audio narration validate --episode <episode-id> --language en --variant full [--validation-only] [--strict]`
- `pnpm mediaforge -- audio narration status --episode <episode-id> --all-languages --all-variants --json`
- `pnpm mediaforge -- audio narration inspect --episode <episode-id> --language en --variant full --json`
- `pnpm mediaforge -- audio narration benchmark-voices [--voices alloy,onyx] [--max-samples 4] [--language en] [--variant full] [--output-dir <path>] [--benchmark-label-mode anonymous]`
- `pnpm mediaforge -- stories localize --episode <episode-id>`
- `pnpm mediaforge -- stories rewrite-full --episode <episode-id>`
- `pnpm mediaforge -- stories rewrite-short --episode <episode-id>`
- `pnpm mediaforge -- stories dynamic preview --input <story.txt> --content-id <episode-id> --budget standard [--fixture-response <fixture.json>] --json`
- `pnpm mediaforge -- stories dynamic analyze --input <story.txt> --content-id <episode-id> --revision <revision> --budget standard [--overrides <safe-overrides.json>] --json`
- `pnpm mediaforge -- images plan --episode <episode-id>`
- `pnpm mediaforge -- images generate --episode <episode-id>`
- `pnpm mediaforge -- images resume --episode <episode-id>`
- `pnpm mediaforge -- render --episode <episode-id>`
- `pnpm mediaforge -- render remote check`
- `pnpm mediaforge -- render remote verify`
- `pnpm mediaforge -- render remote status [--job <job-id>] [--limit <count>] [--all] [--include-logs]`
- `pnpm mediaforge -- render remote logs <job-id> [--clip <clip-id>] [--tail <lines>]`
- `pnpm mediaforge -- render remote cleanup`
- `pnpm mediaforge -- math renderer remote deploy`
- `pnpm mediaforge -- math renderer remote check`
- `pnpm mediaforge -- math renderer remote status [--job <math-job-id>]`
- `pnpm mediaforge -- math renderer remote logs <math-job-id>`
- `pnpm mediaforge -- math renderer remote cleanup`
- `pnpm mediaforge -- math renderer benchmark --lesson <lesson-id> --workspace <private-workspace> --authorize-resource-use [--artifact <report.json>]`
- `pnpm mediaforge -- math production run ... [--render-executor local|remote|hybrid]`
- `pnpm mediaforge -- math production resume ... [--render-executor local|remote|hybrid]`
- `pnpm mediaforge -- math batch run ... [--render-executor local|remote|hybrid]`
- `pnpm mediaforge -- math batch resume ... [--render-executor local|remote|hybrid]`
- `pnpm mediaforge -- metadata youtube --episode <episode-id>`
- `pnpm mediaforge -- youtube upload --episode <episode-id>`

Math scene-worker operations reuse the `REMOTE_RENDER_*` SSH, timeout, retry,
retention, and fallback settings. They additionally accept
`MEDIAFORGE_MATH_RENDER_EXECUTOR=local|remote|hybrid`,
`MEDIAFORGE_MATH_REMOTE_IMAGE_ID=sha256:<64-hex>`,
`MEDIAFORGE_MATH_LOCAL_SCENE_SLOTS`, `MEDIAFORGE_MATH_REMOTE_SCENE_SLOTS`, and
`MEDIAFORGE_MATH_REMOTE_JOB_CONCURRENCY`. Math remote commands require strict
host-key verification and an enabled remote transport. `deploy` writes an
ignored receipt under `.mediaforge/math-render-remote/`; `cleanup` only removes
old, completed, schema-recognized math jobs and never the shared cache.
The explicit `--render-executor` option takes precedence over
`MEDIAFORGE_MATH_RENDER_EXECUTOR`; an unset installation remains on the native
local renderer. `remote` and `hybrid` require a compatible local/remote
preflight and one immutable image ID. Scene fragments return to the operator
machine for strict validation, ordered assembly, narration muxing, final media
QA, and atomic promotion. Retryable remote shard failures are bounded and
reassigned per scene to the local Docker lane; identity or integrity failures
fail closed.
The benchmark command additionally requires a render-ready
`locales/de/render/benchmark-input.json`. It uses temporary media outputs,
performs no provider calls, and writes only the requested versioned report.
Do not pass `--authorize-resource-use` until Docker image transfer/load, remote
smoke work, and benchmark capacity have explicit human authorization. See
[Remote Math Renderer Operations](../remote-rendering/operations.md).

## Validation Guidance

- Prefer file-targeted Vitest and ESLint runs.
- Do not default to `pnpm build`, `pnpm test`, root `pnpm lint`, or root `pnpm typecheck` for routine narrow changes.

## Staged Narration Operations

Use `--narration-pipeline-mode legacy|shadow|new` as a global option before the command. `legacy` is the default and preserves existing audio behavior. `shadow` lets `audio narration` write staged artifacts without promoting compatibility `narration.wav`. `new` makes staged narration authoritative and promotes `mastered-narration.wav` to compatibility outputs during assembly.

Normal production usage for localized OpenAI narration is:

1. Run `prepare`, `plan`, `generate`, `assemble`, and `validate` with `--tts-provider openai-compatible --narration-pipeline-mode shadow audio narration <stage> --episode <episode-id> --all-languages --variant full --json`.
2. Inspect `episodes/<episode-id>/locales/<locale>/full/audio/narration/quality-gate.json`.
3. Rerun the same staged commands with `--narration-pipeline-mode new --resume`, or use `pnpm mediaforge -- --tts-provider openai-compatible --narration-pipeline-mode new audio generate-localized <episode-id> --languages <comma-list> --strict` for the implemented localized aggregate path.

`--dry-run` prints planned stage outputs without writing. `--resume` skips valid completed stage artifacts. `--force` reruns completed stages. `--validation-only` skips generation and assembly and validates existing staged artifacts. `--strict` returns exit code `4` when warnings are present. For batches, use `--all-languages`, `--all-variants`, `--languages <comma-list>`, and `--concurrency <n>`; strict mode treats warning-only targets as an operational failure.

Artifacts for one target live in `episodes/<episode-id>/locales/<locale>/<variant>/audio/narration/`. Cache records are per chunk under that root and validation reports are `chunks/<chunk-id>.validation.json`. Benchmark runs write `voice-benchmark.json` under `--output-dir` or `episodes/state/voice-benchmarks/<language>/<variant>/`.

Rollback is config-only first: rerun with `--narration-pipeline-mode legacy`, then use `audio generate` or `audio generate-localized` to recreate legacy `audio/narration.wav` outputs. Leave staged artifacts in place unless a separate cleanup task confirms all deletion criteria in the architecture docs.
