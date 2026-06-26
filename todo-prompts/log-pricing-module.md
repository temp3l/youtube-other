You are working in an existing TypeScript monorepo for an automated YouTube production pipeline named MediaForge.

Implement production-grade observability for:

1. Every npm script execution
2. Every external API request
3. Every episode’s total API usage and estimated cost
4. Detailed image-generation attempts and retries
5. Per-image and aggregate image costs
6. Transcript-generation costs
7. Metadata-generation costs
8. Any other AI or paid API calls used by the pipeline

Before making changes, inspect the repository structure, existing schemas, CLI commands, npm scripts, OpenAI integrations, image generation, transcription, metadata generation, episode manifests, logging infrastructure, and persistence mechanisms.

Do not replace working architecture unnecessarily. Extend existing abstractions where possible.

## Primary objective

After any MediaForge command completes, the system must produce a structured execution report showing:

- command executed
- npm script name
- raw CLI arguments
- execution ID
- episode ID, when applicable
- start time
- end time
- duration
- success or failure
- exit code
- API calls performed
- token usage
- generated images
- image retries
- transcript cost
- metadata cost
- image cost
- total episode API cost
- total execution API cost
- failed API calls
- retried API calls
- provider request IDs, when available
- model names
- pricing version used
- warnings when usage data or pricing data is incomplete

The implementation must remain strictly typed and compatible with the project’s TypeScript configuration.

## Important design requirements

### 1. Centralized cost-accounting service

Create a centralized service or module responsible for recording API usage and calculating estimated costs.

Suggested responsibilities:

- accept normalized usage events
- calculate estimated cost using configurable pricing
- aggregate usage by:

  - execution
  - episode
  - provider
  - model
  - operation type
  - image
  - retry attempt

- persist detailed events
- generate execution summaries
- generate episode summaries
- avoid double-counting retries or repeated report generation

Use clear interfaces and discriminated unions.

Suggested event categories:

- `text-generation`
- `metadata-generation`
- `transcription`
- `speech-generation`
- `image-generation`
- `image-edit`
- `embedding`
- `moderation`
- `youtube-upload`
- `other-api`

Do not represent all usage records as loosely typed dictionaries.

### 2. Configurable pricing catalog

Do not scatter pricing constants across the codebase.

Implement a versioned pricing catalog, for example:

```ts
interface PricingCatalog {
  readonly version: string;
  readonly effectiveFrom: string;
  readonly providers: Readonly<Record<string, ProviderPricing>>;
}
```

The pricing catalog should support:

- input-token pricing
- cached-input-token pricing
- output-token pricing
- audio input
- audio output
- transcription duration
- speech generation
- image pricing by:

  - model
  - size
  - quality
  - operation type

- fixed per-request pricing where needed

Load pricing from configuration, JSON, or a typed source file.

Support environment overrides where practical.

Every report must record the pricing catalog version used.

When pricing is unknown:

- do not silently assume zero
- mark cost as unavailable
- include a warning
- preserve raw usage data

Use decimal-safe monetary calculations. Do not use floating-point arithmetic directly for cumulative monetary values. Store money in integer micro-units, nano-units, or use an existing decimal library already present in the repository.

Suggested internal representation:

```ts
type MoneyMicros = number;
```

One currency unit equals 1,000,000 micros.

Guard against unsafe integers. If accumulated values could exceed safe integer limits, use `bigint` or a decimal library.

### 3. Execution context

Create an execution context when any MediaForge CLI command starts.

The execution context should include:

```ts
interface ExecutionContext {
  readonly executionId: string;
  readonly command: string;
  readonly npmScript?: string;
  readonly argv: readonly string[];
  readonly cwd: string;
  readonly startedAt: string;
  readonly episodeId?: string;
}
```

Use an execution ID such as a UUID.

The context must be available to downstream API clients without manually passing dozens of parameters through every function.

Use one of these approaches, depending on the existing architecture:

- explicit dependency injection
- AsyncLocalStorage
- request-scoped service
- command-scoped context object

Prefer explicit dependency injection unless the existing CLI architecture makes AsyncLocalStorage significantly cleaner.

Do not introduce global mutable state.

### 4. Log every npm script execution

Implement a reliable wrapper for npm scripts used by MediaForge.

Preferred approach:

- create a Node.js runner such as `scripts/run-with-telemetry.mjs`
- update relevant `package.json` scripts to execute through it
- preserve exit codes and signals
- capture:

  - script name
  - command
  - arguments
  - start time
  - end time
  - duration
  - stdout/stderr destinations
  - success/failure
  - child-process exit code
  - termination signal

Example intended usage:

```json
{
  "scripts": {
    "mediaforge": "node scripts/run-with-telemetry.mjs mediaforge -- node apps/cli/dist/index.js"
  }
}
```

Do not create recursive npm execution.

Do not break argument forwarding such as:

```bash
npm run mediaforge -- clips generate 001-example
```

The wrapper must propagate:

- exit code
- SIGINT
- SIGTERM
- uncaught errors

If modifying every npm script is too invasive, implement a reusable wrapper and update all pipeline-related scripts first. Clearly document scripts not yet covered.

### 5. Structured logging

Use structured JSON logging.

Every log entry should include where relevant:

- timestamp
- level
- event name
- execution ID
- episode ID
- provider
- model
- operation
- attempt number
- request ID
- duration
- estimated cost
- error category

Do not use ad hoc `console.log()` for telemetry.

Existing user-facing CLI output may remain human-readable, but telemetry must use the project’s logger or a dedicated structured logger.

Sensitive values must never be logged:

- API keys
- OAuth tokens
- authorization headers
- refresh tokens
- full provider request payloads containing secrets
- private user data

Create a sanitizer for metadata and error details.

### 6. API usage event model

Implement a normalized event schema similar to:

```ts
type ApiUsageEvent =
  | TextGenerationUsageEvent
  | ImageGenerationUsageEvent
  | TranscriptionUsageEvent
  | SpeechGenerationUsageEvent
  | GenericApiUsageEvent;
```

Each event should include:

```ts
interface BaseApiUsageEvent {
  readonly eventId: string;
  readonly executionId: string;
  readonly episodeId?: string;
  readonly provider: string;
  readonly model?: string;
  readonly operation: string;
  readonly attempt: number;
  readonly startedAt: string;
  readonly completedAt: string;
  readonly durationMs: number;
  readonly status: "succeeded" | "failed";
  readonly providerRequestId?: string;
  readonly estimatedCostMicros?: number;
  readonly pricingVersion: string;
  readonly error?: SanitizedApiError;
}
```

Text usage should include:

- input tokens
- cached input tokens
- output tokens
- total tokens
- reasoning tokens when available

Image usage should include:

- image ID or local asset ID
- scene ID
- image index
- model
- requested size
- actual size when known
- quality
- format
- generation or edit operation
- attempt number
- retry reason
- success/failure
- estimated cost for that attempt
- cumulative cost for that final image, including failed paid attempts when applicable

Transcription usage should include:

- model
- audio duration
- audio size
- language
- input token usage when returned
- output token usage when returned
- estimated cost

Metadata usage should include:

- metadata type
- title generation
- description generation
- tags
- chapters
- localization
- input tokens
- output tokens
- estimated cost

### 7. Image retries

Instrument image generation at the lowest shared API-client layer so every image attempt is recorded.

For each image, track:

- logical image ID
- episode ID
- scene ID
- prompt hash
- attempt number
- retry count
- provider
- model
- size
- quality
- format
- start/end timestamps
- duration
- success/failure
- error code
- retry reason
- provider request ID
- estimated cost for that attempt

Do not log full prompts by default. Store a SHA-256 prompt hash and optionally a sanitized/truncated prompt preview.

The final episode report must distinguish:

- requested images
- successfully generated images
- failed images
- total attempts
- retries
- average attempts per image
- cost per successful image
- total image-attempt cost
- wasted retry cost
- cost per scene
- total episode image cost

Important: some failed provider requests may not be billable. The event schema should therefore support:

```ts
readonly billingStatus:
  | "billable"
  | "not-billable"
  | "unknown";
```

Unknown billing status must be reported separately rather than assumed billable or free.

### 8. Episode cost summary

Every episode must have a generated summary file.

Suggested locations:

```text
episodes/<episode-id>/reports/api-cost-summary.json
episodes/<episode-id>/reports/api-cost-summary.md
```

The JSON file is canonical and machine-readable.

The Markdown report is for humans.

Suggested JSON structure:

```ts
interface EpisodeCostSummary {
  readonly schemaVersion: number;
  readonly episodeId: string;
  readonly generatedAt: string;
  readonly pricingVersion: string;
  readonly executionIds: readonly string[];

  readonly totals: {
    readonly estimatedCostMicros: number;
    readonly knownCostMicros: number;
    readonly unknownCostEventCount: number;
    readonly apiCallCount: number;
    readonly failedCallCount: number;
    readonly retriedCallCount: number;
  };

  readonly categories: {
    readonly images: ImageCostSummary;
    readonly transcript: OperationCostSummary;
    readonly metadata: OperationCostSummary;
    readonly speech?: OperationCostSummary;
    readonly other: OperationCostSummary;
  };

  readonly providers: readonly ProviderCostSummary[];
  readonly models: readonly ModelCostSummary[];
  readonly warnings: readonly string[];
}
```

The Markdown summary should contain:

```text
Episode API Cost Summary

Episode ID
Pricing version
Executions included

Total estimated API cost

Images
- successful images
- failed images
- attempts
- retries
- retry cost
- cost per successful image
- total image cost

Transcript
- model
- audio duration
- token usage
- total transcript cost

Metadata
- calls
- input tokens
- output tokens
- total metadata cost

Other API usage

Unknown or incomplete pricing entries

Failed calls and retries
```

### 9. Per-execution report

Create one immutable report per execution, for example:

```text
logs/executions/<execution-id>.json
logs/executions/<execution-id>.md
```

The report must be finalized in a `finally` block so failures also produce a report.

Include partial usage if the process fails midway.

Use atomic file writes to avoid corrupt reports.

### 10. Episode-level aggregation semantics

An episode may be processed by multiple CLI executions.

The episode summary must aggregate all usage events associated with that episode.

Avoid double counting by using stable event IDs.

Re-running report generation must be idempotent.

Do not derive lifetime episode cost by summing previously generated summary files. Aggregate canonical usage events instead.

Recommended persistence approach:

```text
logs/api-usage/YYYY-MM-DD/<execution-id>.jsonl
```

or an existing SQLite/database layer if the project already has one.

If the existing application already uses SQLite, evaluate whether it is appropriate for telemetry. Use it only if doing so does not create unnecessary coupling.

### 11. API client instrumentation

Find every direct provider SDK or HTTP call.

Refactor through shared instrumented wrappers where practical.

For OpenAI calls, capture usage fields returned by the API response. Support different response shapes safely.

Do not assume every endpoint returns token usage.

Where usage data is absent:

- store known request dimensions
- calculate fixed-cost operations when pricing is deterministic
- otherwise mark cost unavailable

Do not estimate text token usage from string length when authoritative usage exists.

A tokenizer-based fallback may be used only when:

- the provider does not return usage
- the report clearly marks the value as estimated
- the model tokenizer is known

### 12. Error and retry handling

Instrument retries centrally.

A retry event must reference the previous attempt or share a stable logical operation ID.

Use:

```ts
interface RetryMetadata {
  readonly operationId: string;
  readonly attempt: number;
  readonly maxAttempts: number;
  readonly retryReason?: string;
  readonly previousErrorCode?: string;
  readonly backoffMs?: number;
}
```

Do not count the first attempt as a retry.

Record retry backoff duration separately from provider request duration.

Preserve the original error as `cause` where supported.

### 13. CLI output

At the end of a successful episode command, print a concise summary such as:

```text
Episode completed: 001-example

API cost summary
  Images:     $1.842000
  Transcript: $0.031200
  Metadata:   $0.004800
  Other:      $0.000000
  Total:      $1.878000

Images
  Successful: 42
  Attempts:   46
  Retries:    4
  Retry cost: $0.164000

Report:
  episodes/001-example/reports/api-cost-summary.md
```

On failure, print:

```text
Execution failed after partial processing.

Partial estimated API cost: $0.821000
Execution report: logs/executions/<execution-id>.md
```

Do not hide the original command error.

### 14. Formatting money

Implement a single money formatter.

Requirements:

- configurable currency, default USD
- at least six decimal places in machine-readable reports
- sensible display precision in terminal output
- no binary floating-point accumulation
- preserve exact micro-unit values in JSON

Example:

```ts
function formatMoneyMicros(amountMicros: number, currency = "USD"): string;
```

### 15. Testing

Add unit and integration tests.

Required unit tests:

- text-token pricing calculation
- cached-token pricing
- image pricing by model/size/quality
- transcript pricing by duration
- unknown pricing handling
- money aggregation
- retry counting
- retry-cost calculation
- failed non-billable request
- failed unknown-billing request
- idempotent aggregation
- duplicate event rejection
- episode aggregation across multiple executions
- sanitized logging
- report formatting
- atomic report writing

Required integration tests:

- successful episode command
- failed command after one paid API call
- image generation with two retries
- transcript plus metadata plus image generation
- missing pricing entry
- npm wrapper preserving arguments and exit code
- SIGINT handling
- partial report generation

Mock external API calls. Tests must not spend real API credits.

### 16. TypeScript quality

Use:

- strict types
- readonly properties where appropriate
- discriminated unions
- exhaustive switches
- Zod validation for persisted JSON
- explicit return types for exported functions
- no `any`
- no unsafe casts unless isolated and documented
- `unknown` at external boundaries
- schema-derived TypeScript types

For example:

```ts
type ApiUsageEvent = z.infer<typeof apiUsageEventSchema>;
```

### 17. Performance and reliability

Recommendations:

- write API usage events incrementally so a crash does not lose all cost data
- use append-only JSONL or a transactional store
- avoid rewriting large telemetry files after each API call
- debounce episode-summary regeneration when many images are generated
- finalize summaries at command completion
- support manual report regeneration
- use atomic rename for final report files
- limit prompt previews and error payload sizes
- never block image-generation concurrency on expensive report formatting
- ensure telemetry failures do not silently lose billing data
- decide explicitly whether telemetry persistence failure should fail the command

Recommended policy:

- failure to persist raw API usage events should fail the command
- failure to generate optional Markdown reports should log an error but preserve the successful media operation
- JSON report generation should be treated as required

### 18. Recommended commands

Add commands similar to:

```bash
npm run mediaforge -- costs execution <execution-id>
npm run mediaforge -- costs episode <episode-id>
npm run mediaforge -- costs rebuild <episode-id>
npm run mediaforge -- costs list --from 2026-06-01 --to 2026-06-30
```

Also consider:

```bash
npm run mediaforge -- episodes list
```

This should list valid episode IDs and their accumulated API costs.

### 19. Documentation

Add documentation covering:

- telemetry architecture
- pricing configuration
- how costs are calculated
- known limitations
- how retries are billed
- where reports are stored
- how to regenerate reports
- how to update pricing
- how to add a new provider or model
- how to inspect unknown-cost events
- why provider billing dashboards may differ from local estimates

Explicitly state that local costs are estimates and the provider invoice remains authoritative.

### 20. Deliverables

Implement the changes, then provide:

1. Summary of architecture
2. Files created
3. Files modified
4. Database or schema changes
5. New npm scripts
6. New CLI commands
7. Pricing assumptions
8. Tests added
9. Commands used to validate the implementation
10. Remaining limitations
11. Example execution report
12. Example episode report

Run:

```bash
npm run build
npm run lint
npm test
```

Also run relevant workspace-specific commands.

Fix all errors introduced by the implementation.

Do not merely describe the implementation. Make the code changes.

## Additional recommendations

Apply these recommendations unless they conflict with established repository conventions:

- use one canonical raw usage-event store
- derive all summaries from raw events
- version persisted schemas
- version pricing catalogs
- separate provider usage from cost calculation
- record known, unknown, and estimated cost independently
- track billable status per attempt
- keep retry cost visible
- associate every generated asset with a logical operation ID
- store provider request IDs for invoice reconciliation
- include execution IDs in all logs
- use atomic writes
- never log secrets
- do not hard-code current prices inside API clients
- make report regeneration deterministic
- add migration support for future schema changes
