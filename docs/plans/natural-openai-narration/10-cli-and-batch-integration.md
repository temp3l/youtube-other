# CLI and Batch Integration

## Current Evidence

- CLI is Commander-based in `apps/cli/src/index.ts`.
- Existing audio commands are `audio generate` and `audio generate-localized`.
- Story and image batch flows already support manifests, partial imports, status, and retry concepts.

## Command Strategy

Preserve current commands and add narration subcommands under `audio narration`:

- `audio narration prepare --episode <id>`
- `audio narration plan --episode <id>`
- `audio narration generate --episode <id>`
- `audio narration assemble --episode <id>`
- `audio narration validate --episode <id>`
- `audio narration status --episode <id>`
- `audio narration inspect --episode <id>`
- `audio narration benchmark-voices`

Then migrate `audio generate` to orchestrate `prepare -> plan -> generate -> assemble -> validate` when `narrationPipelineMode` is `new`.

## Options

Support:

- `--language <code>`;
- `--languages <codes>`;
- `--variant <full|short>`;
- `--all-variants`;
- `--resume`;
- `--force`;
- `--dry-run`;
- `--validation-only`;
- `--json`;
- `--concurrency <n>`;
- `--profile <name>`;
- `--benchmark-label-mode <anonymous|voice>`.

## Batch Behavior

Audio TTS should not use OpenAI Batch API initially because the speech endpoint returns binary audio and the current repo batch infrastructure is JSONL/text/image oriented. Instead, support local batch processing:

- selected episodes/languages/variants produce independent jobs;
- each chunk is independently cacheable and resumable;
- failed chunks/languages are reported without deleting successful outputs;
- final exit code is non-zero only if any requested output failed, with machine-readable summary.

## Exit Codes

- `0`: all requested outputs ready.
- `1`: user/config error.
- `2`: generation failed for at least one requested target.
- `3`: validation blocked output.
- `4`: partial success with warnings when strict mode is enabled.

Cost impact: low because resume/cache prevents duplicate generation.
