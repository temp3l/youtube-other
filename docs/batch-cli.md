# Batch CLI

This guide covers the story-localization batch pipeline used by the video production workflow. It is the operational batch path for creating OpenAI batch requests, tracking remote job state, importing completed results, and recovering from failures.

The batch pipeline is not the same thing as the render or upload pipeline. It produces story artifacts that later feed audio, image, render, metadata, and upload steps.

## Where It Lives

- CLI entry point: [`apps/cli/src/story-localization-commands.ts`](../apps/cli/src/story-localization-commands.ts)
- Batch storage and OpenAI batch orchestration: [`packages/story-localization/src/story-localization-batch-service.ts`](../packages/story-localization/src/story-localization-batch-service.ts)
- Batch storage layout helpers: [`packages/story-localization/src/story-localization-batch-storage.ts`](../packages/story-localization/src/story-localization-batch-storage.ts)
- Batch index: [`packages/story-localization/src/story-localization-batch-index.ts`](../packages/story-localization/src/story-localization-batch-index.ts)

## What The Batch Pipeline Does

The batch pipeline takes canonical English source stories and turns them into OpenAI batch request files. Depending on the command and configuration, it can prepare:

- canonical English full rewrites
- English short rewrites
- localized full rewrites, such as `de`, `es`, `fr`, and `pt`

It then:

1. materializes the canonical source into the episode workspace
2. extracts canonical story facts and production context
3. builds request payloads and a local batch manifest
4. writes an OpenAI batch JSONL input file
5. submits the batch to OpenAI when asked
6. refreshes remote status into the local manifest and index
7. imports finished results into episode workspace outputs
8. records retry, cancel, and failure lineage in the batch index

## Command Surfaces

There are two user-facing command groups:

- `stories localize`
- `stories:batches`

The first command group prepares batch work from discovered source stories. The second command group inspects, refreshes, imports, retries, and repairs persisted batch state.

### `stories localize`

This is the batch-capable localization command. In batch mode, the CLI wrapper currently prepares a batch and optionally submits it.

Example:

```bash
npm run stories:localize -- \
  --episode 014-hachishakusama-the-eight-foot-woman \
  --languages de,es,fr \
  --mode batch \
  --prepare-batch
```

With `--submit`, the same command prepares and submits in one step:

```bash
npm run stories:localize -- \
  --episode 014-hachishakusama-the-eight-foot-woman \
  --languages de,es,fr \
  --mode batch \
  --submit
```

Important detail:

- the CLI wrapper prepares and submits
- refresh, import, retry, and cancel are handled by `stories:batches`
- programmatic batch execution in `packages/story-localization` has a richer wait/import loop than the CLI wrapper

### `stories:batches`

This is the operational batch utility namespace.

Available commands:

- `list`
- `latest`
- `pending`
- `ready`
- `completed`
- `failed`
- `expired`
- `find`
- `show`
- `status`
- `refresh`
- `import`
- `import-ready`
- `retry-failed`
- `cancel`
- `verify-index`
- `rebuild-index`

## Storage Layout

Batch state is stored under the episode output directory in `.batch/`.

Example layout:

```text
episodes/<episode-slug>/
  .batch/
    batch-index.json
    inputs/
      batch-slb-20260702153000123-001.jsonl
    manifests/
      batch-slb-20260702153000123-001.manifest.json
    results/
      batch-slb-20260702153000123-001.output.jsonl
    errors/
      batch-slb-20260702153000123-001.errors.jsonl
    reports/
      batch-slb-20260702153000123-001.summary.json
    locks/
    pending/
    submitted/
    completed/
    failed/
    expired/
    cancelled/
    quarantine/
```

The important files are:

- `batch-index.json`: searchable index of all known local batches
- `inputs/*.jsonl`: OpenAI batch request payloads
- `manifests/*.manifest.json`: local manifest for each batch
- `results/*.output.jsonl`: downloaded successful batch output
- `errors/*.errors.jsonl`: downloaded error output, if present
- `reports/*.summary.json`: import summary and bookkeeping

## Batch IDs And Request IDs

Local batch IDs are generated as:

- `slb-<timestamp>-<counter>`

The timestamp is compacted from ISO time. The counter increments if there is a collision.

Each request line gets a deterministic `custom_id` that starts with:

- `dte:<episodeNumber>:<operation>:<language|none>:<sourceHash8>:<configurationHash8>`

If a retry is created, the ID gets an `:rN` suffix.

That deterministic ID is how the import step matches remote output lines back to local manifest items.

## Manifest Model

Each manifest tracks:

- the batch category
- the local batch ID
- the parent batch, if this is a retry
- the root batch ID for the retry chain
- the OpenAI batch ID and input file ID, once submitted
- the input file path and hash
- the request item list
- per-item status, preflight results, and lineage
- final result and report file paths, after import

Manifest status values include:

- `prepared`
- `uploading`
- `submitted`
- `validating`
- `in_progress`
- `finalizing`
- `completed`
- `failed`
- `expired`
- `cancelling`
- `cancelled`
- `imported`
- `imported_with_failures`

Item status values include:

- `planned`
- `submitted`
- `api-succeeded`
- `api-failed`
- `expired`
- `schema-invalid`
- `content-invalid`
- `repair-required`
- `preflight-failed`
- `persisted`
- `skipped-cached`

## Batch Index Model

The batch index is the operator-facing view over all manifests. It is rebuilt from manifests, and it powers the `list`, `latest`, `find`, `show`, and filtered state commands.

Batch index status values include the manifest statuses above plus:

- `partially_completed`

Common index filters are based on:

- category
- status
- episode number
- language
- operation
- model
- imported versus not imported
- requires import
- retryable failures

## End-To-End Flow

### 1. Discover and prepare source stories

`stories localize` discovers canonical English source stories from the configured source directory. In batch mode, it materializes the canonical source into the output workspace, extracts facts, and writes batch artifacts.

Example:

```bash
npm run stories:localize -- \
  --episode 014-hachishakusama-the-eight-foot-woman \
  --languages de,es,fr \
  --mode batch \
  --prepare-batch \
  --output-dir ./episodes
```

This produces:

- a batch manifest
- a JSONL input file
- a batch index entry
- story-production artifacts such as source analysis, bible, retention plan, and protected elements

### 2. Submit the batch

Use `--submit` on `stories localize`, or submit an existing prepared batch with `stories:batches import` after the remote job completes.

Example:

```bash
npm run stories:localize -- \
  --episode 014-hachishakusama-the-eight-foot-woman \
  --languages de,es,fr \
  --mode batch \
  --submit \
  --output-dir ./episodes
```

Submission does three things:

- uploads the JSONL input file to OpenAI
- creates the remote batch
- updates the local manifest and index to `submitted`

### 3. Refresh remote status

Use `stories:batches status` for one batch, or `stories:batches refresh` for all active batches.

Examples:

```bash
npm run stories:batches -- status --batch slb-20260702153000123-001 --output-dir ./episodes
npm run stories:batches -- refresh --output-dir ./episodes
```

Refreshing updates:

- remote batch status
- output file ID
- error file ID
- completion timestamp
- request counts

### 4. Import completed results

When a batch is complete and downloadable output exists, import it.

Example:

```bash
npm run stories:batches -- import --batch slb-20260702153000123-001 --output-dir ./episodes
```

What import does:

- downloads output and error JSONL files
- validates each line against the expected request IDs
- writes local result and error copies
- parses and validates the returned story payloads
- persists the final markdown and production artifacts into the episode workspace
- writes a per-batch summary report
- updates item statuses to `persisted` or a failure class

Import failure classes are not collapsed into one generic error. They are recorded as:

- `api-failed`
- `schema-invalid`
- `content-invalid`
- `preflight-failed`

### 5. Retry failed items

If a batch has retryable item failures, create a retry batch.

Retryable statuses are:

- `api-failed`
- `expired`
- `schema-invalid`
- `content-invalid`
- `repair-required`

Example:

```bash
npm run stories:batches -- retry-failed --batch slb-20260702153000123-001 --output-dir ./episodes
```

The retry batch:

- uses a new local batch ID
- points to the original batch as `parentLocalBatchId`
- increments `retryNumber`
- only includes the retryable items
- keeps the same root batch ID for lineage

### 6. Cancel a remote batch

Cancellation is a remote API operation plus local state update.

Example:

```bash
npm run stories:batches -- cancel --batch slb-20260702153000123-001 --output-dir ./episodes
```

The batch is marked `cancelling` locally after the cancel request is sent.

## Command Reference

### Discovery Commands

`list`

- returns every indexed batch

`latest`

- returns the most recently created batch

`pending`

- returns batches in one of the active pre-import states:
  - `prepared`
  - `submitted`
  - `validating`
  - `in_progress`
  - `finalizing`

`ready`

- returns batches that require import

`completed`

- currently wired to the same implementation as `ready`
- returns the same batches that require import

`failed`

- returns batches with failure-oriented statuses:
  - `failed`
  - `partially_completed`
  - `imported_with_failures`

`expired`

- returns batches whose status is `expired`

`find`

- returns all indexed batches for a given episode number or slug

`show`

- returns the indexed batch matching a local batch ID or OpenAI batch ID

### State Commands

`status`

- refreshes a single batch from OpenAI
- writes the updated local manifest
- prints the refreshed manifest JSON

`refresh`

- refreshes all active batches
- active means `submitted`, `validating`, `in_progress`, or `finalizing`

`import`

- imports a single batch by local batch ID or OpenAI batch ID

`import-ready`

- imports every batch that currently requires import
- skips batches that fail during import and keeps going

`retry-failed`

- creates a retry batch from retryable failures

`cancel`

- sends a cancel request to OpenAI and marks the manifest as `cancelling`

### Repair Commands

`verify-index`

- verifies internal consistency of the batch index
- with `--repair`, it rebuilds the index instead of just reporting issues

`rebuild-index`

- rescans manifests and rewrites the index from disk

## Examples

### Prepare one batch without submitting

```bash
npm run stories:localize -- \
  --episode 014-hachishakusama-the-eight-foot-woman \
  --languages de,es,fr \
  --mode batch \
  --prepare-batch \
  --output-dir ./episodes
```

Use this when you want to inspect the generated manifest and JSONL input before contacting OpenAI.

### Prepare and submit immediately

```bash
npm run stories:localize -- \
  --episode 014-hachishakusama-the-eight-foot-woman \
  --languages de,es,fr \
  --mode batch \
  --submit \
  --output-dir ./episodes
```

This is the shortest path from source story to remote batch submission.

### Poll a submitted batch

```bash
npm run stories:batches -- status --batch slb-20260702153000123-001 --output-dir ./episodes
```

### Import every batch that is ready

```bash
npm run stories:batches -- import-ready --output-dir ./episodes
```

### Repair a broken index

```bash
npm run stories:batches -- verify-index --repair --output-dir ./episodes
```

### Rebuild the index from manifests

```bash
npm run stories:batches -- rebuild-index --output-dir ./episodes
```

## How This Feeds Video Production

The batch pipeline generates the localized story artifacts that downstream production stages consume.

After import, the batch system writes outputs into the episode workspace, typically including:

- English canonical full scripts
- English short scripts
- localized full scripts in language subdirectories
- story-production artifacts under `story-production/`
- localization cache entries

Those outputs are then used by later steps in the production chain:

- audio generation reads finalized scripts
- image generation reads story and scene context
- rendering consumes the generated media assets
- metadata and upload steps consume the final episode outputs

In practical terms, the batch pipeline is the durable, resumable story-generation front end for the rest of the video pipeline.

## Operational Notes

- Input files are hashed before submission. Submission fails if the input hash no longer matches the manifest.
- Batch requests use deterministic IDs so import can map responses back to manifest items.
- Import writes a report even when some items fail.
- `import-ready` is intentionally best-effort and continues after individual batch failures.
- The batch index is not the source of truth. The manifests and workspace files are.
- When a manifest and index disagree, rebuild the index from manifests.

