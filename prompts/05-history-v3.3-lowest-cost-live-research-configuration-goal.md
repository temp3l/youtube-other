# Agentic Goal — History V3.3 Lowest-Cost Live Research Configuration

## Run from the repository root

Save this file in the repository, for example:

```text
prompts/05-history-v3.3-lowest-cost-live-research-configuration-goal.md
```

Start Codex from the repository root and run:

```text
/goal Implement every requirement and satisfy every acceptance criterion in @prompts/05-history-v3.3-lowest-cost-live-research-configuration-goal.md. Configure the History V3.3 live-research pipeline for the lowest practical cost while preserving factuality, deterministic provenance, resumability, auditability, and fail-closed approval behavior. Continue until the implementation, tests, CLI documentation, cost controls, and one-episode validation are complete, or until a concrete external blocker is proven with exact evidence.
```

Recommended Codex configuration:

```toml
model = "gpt-5.6-terra"
model_reasoning_effort = "high"
model_verbosity = "low"
```

This model choice applies to Codex implementation work. The runtime History research pipeline must use the cheaper routing defined below.

---

# Goal

Configure the History V3.3 live-research workflow for the lowest practical API cost without weakening:

- atomic claim extraction;
- source quality;
- evidence traceability;
- deterministic provenance;
- approval blocking;
- map/diagram correctness;
- review-pack completeness;
- resumability;
- observability;
- security.

The target runtime architecture is:

```text
Local deterministic preprocessing
        ↓
Luna-first batched semantic processing
        ↓
Clustered and budgeted web discovery
        ↓
Local source fetching and indexing
        ↓
Local candidate-fragment selection
        ↓
Luna evidence assessment
        ↓
Terra escalation only for hard cases
        ↓
Deterministic provenance
        ↓
Frozen research snapshot
        ↓
Deterministic visual planning and review packaging
```

Do not reduce cost by silently skipping claims, inventing evidence, weakening approval gates, or marking unsupported claims as supported.

---

# Core cost policy

Implement these default runtime policies for the History V3.3 profile:

```text
Primary semantic model: gpt-5.6-luna
Escalation model: gpt-5.6-terra
Default web-search budget: 20 calls per episode
Hard web-search ceiling: 25 calls per episode
Maximum searches per research cluster: 2
Maximum alternate-source attempts per failed source: 2
Maximum evidence fragments per claim: 3
Claim extraction batch size: 12–20 narration units
Evidence assessment batch size: bounded by token budget
Completed paid batches: always reused
Broad --force invalidation: prohibited by default
```

Treat model names as configurable strings. Do not assume a model is available merely because it is named here. Validate configured model names before performing paid work and fail clearly when unavailable.

---

# Workstream 1 — Inspect the current implementation

Before changing code:

1. inspect:
   - `packages/history/src/history-research-v33.ts`;
   - `packages/history/src/history-workflow-v33.ts`;
   - History schemas and persistence;
   - CLI provider factories;
   - current OpenAI client construction;
   - current cache implementation;
   - current retry implementation;
   - current source retrieval implementation;
   - current approval-pack exporter;
2. identify all live OpenAI calls;
3. identify all web-search calls;
4. identify where input and output token usage is recorded;
5. identify whether Batch API support already exists;
6. establish focused test/typecheck/lint baseline;
7. record current environment configuration.

Do not modify generated `dist` files directly.

---

# Workstream 2 — Introduce typed cost configuration

Implement a typed History-specific configuration object equivalent to:

```ts
interface HistoryResearchCostConfigV33 {
  claimExtractionModel: string;
  evidenceAssessmentModel: string;
  researchQueryModel: string;
  visualSemanticModel: string;
  escalationModel: string;

  useBatchApi: boolean;
  enableEscalation: boolean;

  maxWebSearchCallsPerEpisode: number;
  hardMaxWebSearchCallsPerEpisode: number;
  maxSearchesPerResearchCluster: number;
  maxAlternateSourceAttempts: number;

  maxEvidenceFragmentsPerClaim: number;
  maxClaimsPerAssessmentBatch: number;
  maxInputTokensPerExtractionBatch: number;
  maxInputTokensPerAssessmentBatch: number;
  maxOutputTokensPerExtractionBatch: number;
  maxOutputTokensPerAssessmentBatch: number;

  reuseRetrievedSources: boolean;
  resumeCompletedBatches: boolean;
  enablePromptCaching: boolean;

  softCostBudgetUsdPerEpisode: number;
  hardCostBudgetUsdPerEpisode: number;
}
```

Support environment variables:

```bash
HISTORY_CLAIM_EXTRACTION_MODEL=gpt-5.6-luna
HISTORY_EVIDENCE_ASSESSMENT_MODEL=gpt-5.6-luna
HISTORY_RESEARCH_QUERY_MODEL=gpt-5.6-luna
HISTORY_VISUAL_SEMANTIC_MODEL=gpt-5.6-luna
HISTORY_ESCALATION_MODEL=gpt-5.6-terra

HISTORY_USE_BATCH_API=true
HISTORY_ENABLE_ESCALATION=true

HISTORY_MAX_WEB_SEARCH_CALLS_PER_EPISODE=20
HISTORY_HARD_MAX_WEB_SEARCH_CALLS_PER_EPISODE=25
HISTORY_MAX_SEARCHES_PER_RESEARCH_CLUSTER=2
HISTORY_MAX_ALTERNATE_SOURCE_ATTEMPTS=2

HISTORY_MAX_EVIDENCE_FRAGMENTS_PER_CLAIM=3
HISTORY_MAX_CLAIMS_PER_ASSESSMENT_BATCH=20
HISTORY_MAX_INPUT_TOKENS_PER_EXTRACTION_BATCH=12000
HISTORY_MAX_INPUT_TOKENS_PER_ASSESSMENT_BATCH=16000
HISTORY_MAX_OUTPUT_TOKENS_PER_EXTRACTION_BATCH=2500
HISTORY_MAX_OUTPUT_TOKENS_PER_ASSESSMENT_BATCH=1500

HISTORY_REUSE_RETRIEVED_SOURCES=true
HISTORY_RESUME_COMPLETED_BATCHES=true
HISTORY_ENABLE_PROMPT_CACHING=true

HISTORY_SOFT_COST_BUDGET_USD_PER_EPISODE=1.25
HISTORY_HARD_COST_BUDGET_USD_PER_EPISODE=2.50
```

Requirements:

- validate all numeric values;
- reject negative and zero limits where invalid;
- validate soft budget does not exceed hard budget;
- document defaults;
- expose effective configuration through a redacted CLI command;
- never log API keys;
- keep configuration scoped to History V3.3;
- preserve existing defaults for unrelated genres.

---

# Workstream 3 — Luna-first model routing

Use the low-cost primary model for:

- atomic claim extraction;
- entity/date/place/quantity extraction;
- research-query generation;
- first-pass evidence assessment;
- first-pass visual semantic classification;
- first-pass map/diagram modality decisions.

Use the escalation model only when deterministic policy identifies a hard case.

## Escalation conditions

Escalate only when one or more of these apply:

- first-pass schema validation repeatedly fails;
- claim alignment is ambiguous;
- a sentence contains multiple materially different causal claims;
- evidence assessments conflict;
- a claim is contested;
- a claim is partially supported and materially important;
- evidence contains contradictory dates, quantities, or entities;
- a high-risk historical estimate has a wide range;
- a map route or diagram edge cannot be resolved safely;
- confidence is below a configured threshold and the claim is material;
- deterministic validation rejects the first-pass semantic result.

Do not escalate:

- ordinary entity extraction;
- clear single-source factual support;
- rhetorical transitions;
- non-material claims;
- already cached successful results;
- structurally valid simple visual classifications.

Persist:

- primary model result;
- escalation reason;
- escalation model;
- escalation usage;
- final selected result.

Do not let escalation override deterministic provenance or approval policy.

---

# Workstream 4 — Cluster claims before web search

Do not perform one web search per claim.

Implement deterministic or low-cost semantic clustering of related claims into research clusters.

Each cluster must include:

- cluster ID;
- claim IDs;
- normalized cluster topic;
- key people;
- dates/periods;
- places;
- quantities;
- search-query candidates;
- source-quality requirements.

Use deterministic grouping where possible. A Luna call may refine ambiguous clusters, but it must not generate one cluster per claim unless genuinely required.

Target approximately:

```text
8–20 research clusters per ten-minute episode
```

The number may vary based on content.

---

# Workstream 5 — Enforce hard web-search budgets

Implement a per-episode search budget ledger.

Track:

- total search calls;
- search calls per cluster;
- alternate-source attempts;
- retrieved result count;
- accepted source count;
- rejected source count;
- rejection reasons;
- estimated direct search-tool cost;
- remaining budget.

Behavior:

- default soft search limit: 20;
- hard search ceiling: 25;
- default searches per cluster: 2;
- default alternate-source attempts: 2;
- when soft limit is reached, stop low-priority exploration;
- when hard limit is reached, stop new searches;
- preserve unresolved claims instead of exceeding the hard limit;
- allow an explicit audited override;
- never silently exceed the budget.

Prioritize clusters by:

1. materiality;
2. visual dependency;
3. factual risk;
4. number of dependent claims;
5. whether one source could support multiple claims.

Expose budget status in CLI output and research snapshots.

---

# Workstream 6 — Use web search for discovery, then fetch locally

Use OpenAI-hosted web search or the configured discovery provider to identify authoritative sources.

Do not repeatedly use paid search to rediscover or reread the same source.

After discovery:

1. canonicalize the source URL;
2. check the local source cache;
3. fetch source content through the existing audited retrieval layer;
4. normalize and hash it;
5. extract headings/sections/paragraphs;
6. store a local source snapshot or reproducible locator where permitted;
7. reuse the source across all related claims and episodes.

Never accept URLs invented in free-form model output.

Reject or downgrade:

- metadata-only pages;
- thin search-result snippets;
- inaccessible pages without reproducible evidence;
- login pages;
- unrelated promotional pages;
- discovery-only aggregators as sole material evidence.

After access failures, use the alternate-source budget rather than repeatedly retrying the same URL.

---

# Workstream 7 — Reuse sources across claims and episodes

Implement content-addressed source reuse.

Cache key should use canonical source identity and retrieved-content hash.

Reuse:

- the same source across multiple claims;
- the same evidence fragment across multiple compatible claims;
- the same authoritative source across related episodes where applicable.

Do not duplicate:

- identical source records;
- identical fetched bodies;
- identical evidence excerpts;
- identical embeddings/index records.

When a source changes, create a new source snapshot revision rather than mutating the old record silently.

---

# Workstream 8 — Local candidate evidence selection

Do not send entire source documents or every fragment to the model.

Before evidence assessment:

1. split locally retrieved sources into bounded fragments;
2. index them using existing local search, full-text search, BM25, deterministic lexical matching, or embeddings already available in the repository;
3. retrieve only the best candidate fragments for each claim;
4. cap candidates at three fragments per claim;
5. prefer source diversity when required;
6. preserve source-quality tiers;
7. keep locators reproducible.

The model should receive only:

- atomic claim;
- selected evidence fragment;
- compact citation metadata;
- necessary temporal/geographic/entity context;
- strict assessment schema.

Do not send full books, long articles, or the entire episode corpus into every assessment call.

---

# Workstream 9 — Compact model outputs

Minimize output tokens while preserving auditability.

For clear first-pass evidence assessments, use a compact structure equivalent to:

```ts
interface CompactClaimEvidenceAssessmentV33 {
  claimId: string;
  evidenceFragmentId: string;
  result:
    | "supports"
    | "partially_supports"
    | "contradicts"
    | "irrelevant"
    | "ambiguous";
  unsupportedAspects: string[];
  contradictionAspects: string[];
  temporalAlignment: "aligned" | "misaligned" | "unclear" | "not_applicable";
  geographicAlignment: "aligned" | "misaligned" | "unclear" | "not_applicable";
  entityAlignment: "aligned" | "misaligned" | "unclear" | "not_applicable";
  confidenceBand: "low" | "medium" | "high";
}
```

Generate detailed rationale only for:

- partial support;
- contradiction;
- contested claims;
- ambiguity;
- low confidence;
- escalated cases.

Apply strict output-token ceilings per batch.

Do not ask models to repeat:

- full claim text;
- full evidence text;
- full source citations;
- policies already known to application code.

---

# Workstream 10 — Prompt caching

Use stable prompt prefixes for repeated extraction and assessment calls.

Place stable content first:

```text
system instructions
semantic policy
materiality policy
assessment policy
strict schema
short examples
dynamic episode/batch payload
```

Use stable cache keys:

```text
history-v33-claim-extraction-<prompt-version>-<schema-version>
history-v33-evidence-assessment-<prompt-version>-<schema-version>
history-v33-visual-semantics-<prompt-version>-<schema-version>
```

Requirements:

- do not include dynamic claims/evidence in the cached prefix;
- record cache-hit/cached-token telemetry when exposed;
- do not assume caching is available for every model/provider;
- fall back safely when unsupported.

---

# Workstream 11 — Batch API support

Use Batch API for asynchronous, non-interactive semantic work when supported and cost-effective:

- claim-extraction batches;
- evidence-assessment batches;
- visual-semantic classification batches.

Do not require Batch API for:

- source discovery that depends on hosted web search unless compatibility is explicitly verified;
- deterministic provenance;
- local source fetching;
- Phase B packaging.

Implement:

- batch request creation;
- stable custom IDs;
- persisted batch job ID;
- resumable polling/status;
- result download;
- per-item validation;
- partial failure recovery;
- cancellation handling;
- local fixture simulation for tests.

If the configured model or structured-output feature does not support Batch API, fall back to synchronous batched calls without weakening correctness.

Do not block the entire episode when a single batch item fails. Retry or escalate only the failed item.

---

# Workstream 12 — Strong result caching and invalidation

Never repeat successful paid work without explicit reason.

Cache claim extraction using:

```text
narration hash
+ narration-unit IDs
+ extraction model
+ prompt version
+ schema version
```

Cache evidence assessment using:

```text
claim hash
+ evidence-fragment hash
+ assessment model
+ prompt version
+ schema version
```

Cache visual semantics using:

```text
purpose/claim/evidence hashes
+ model
+ prompt version
+ schema version
```

Requirements:

- successful paid batches persist immediately;
- interrupted operations resume;
- only failed or stale batches rerun;
- source refresh invalidates only dependent evidence and provenance;
- narration changes invalidate claims and downstream phases;
- prompt/schema/model changes invalidate only affected stages;
- broad `--force` requires an explicit warning and projected cost;
- add narrow controls such as:
  - `--force-batch <id>`;
  - `--refresh-source <id>`;
  - `--invalidate-from <phase>`.

Preserve old frozen research snapshots for audit.

---

# Workstream 13 — Cost accounting and hard stops

Implement a per-episode cost ledger.

Record:

- provider/model;
- operation;
- batch ID;
- input tokens;
- cached input tokens where exposed;
- output tokens;
- reasoning tokens where exposed;
- web-search calls;
- direct tool-call cost estimate;
- model-token cost estimate;
- retry cost;
- escalation cost;
- cumulative episode cost;
- pricing version;
- timestamp.

Do not hard-code pricing permanently in domain logic.

Use a versioned pricing configuration that may be updated independently.

Behavior:

- warn when soft cost budget is approached;
- stop low-priority research at the soft budget;
- hard-stop new paid calls at the hard budget;
- preserve unresolved claims when the hard budget is exhausted;
- allow explicit audited override;
- display projected cost before broad `--force`;
- display current cost after each phase.

When pricing is unavailable, report:

```text
pricing status: unconfigured
cost estimate: unavailable
```

Do not fabricate a cost estimate.

---

# Workstream 14 — Cost-aware research prioritization

Prioritize paid work by expected value.

Highest priority:

- material claims;
- claims driving maps, diagrams, timelines, quotations, or labels;
- claims central to the episode thesis;
- dates, quantities, named events, and causal assertions;
- contested claims;
- claims supporting several visual beats.

Lower priority:

- rhetorical transitions;
- repeated background claims already supported by shared evidence;
- non-material narrative framing;
- details that do not affect factual visuals or the episode thesis.

Do not drop lower-priority material claims. Leave them explicitly unresolved when the budget is exhausted.

---

# Workstream 15 — CLI configuration and reporting

Add or update commands consistent with repository conventions for:

```text
history v3.3 config
history v3.3 cost-status <episode-id>
history v3.3 research-status <episode-id>
```

The CLI should show:

- effective models;
- Batch API mode;
- web-search budget;
- remaining search calls;
- cost budgets;
- completed batches;
- pending batches;
- cache hits;
- escalations;
- estimated cost;
- pricing configuration status.

Add a dry-run mode that estimates:

- number of extraction batches;
- expected research clusters;
- maximum search calls;
- maximum assessment pairs;
- configured cost ceilings;

without performing paid calls.

---

# Workstream 16 — Safe default environment example

Update `.env.example` and History documentation with:

```bash
# History V3.3 low-cost semantic routing
HISTORY_CLAIM_EXTRACTION_MODEL=gpt-5.6-luna
HISTORY_EVIDENCE_ASSESSMENT_MODEL=gpt-5.6-luna
HISTORY_RESEARCH_QUERY_MODEL=gpt-5.6-luna
HISTORY_VISUAL_SEMANTIC_MODEL=gpt-5.6-luna
HISTORY_ESCALATION_MODEL=gpt-5.6-terra

# Batch and caching
HISTORY_USE_BATCH_API=true
HISTORY_ENABLE_ESCALATION=true
HISTORY_REUSE_RETRIEVED_SOURCES=true
HISTORY_RESUME_COMPLETED_BATCHES=true
HISTORY_ENABLE_PROMPT_CACHING=true

# Search budgets
HISTORY_MAX_WEB_SEARCH_CALLS_PER_EPISODE=20
HISTORY_HARD_MAX_WEB_SEARCH_CALLS_PER_EPISODE=25
HISTORY_MAX_SEARCHES_PER_RESEARCH_CLUSTER=2
HISTORY_MAX_ALTERNATE_SOURCE_ATTEMPTS=2

# Batch/token limits
HISTORY_MAX_EVIDENCE_FRAGMENTS_PER_CLAIM=3
HISTORY_MAX_CLAIMS_PER_ASSESSMENT_BATCH=20
HISTORY_MAX_INPUT_TOKENS_PER_EXTRACTION_BATCH=12000
HISTORY_MAX_INPUT_TOKENS_PER_ASSESSMENT_BATCH=16000
HISTORY_MAX_OUTPUT_TOKENS_PER_EXTRACTION_BATCH=2500
HISTORY_MAX_OUTPUT_TOKENS_PER_ASSESSMENT_BATCH=1500

# Cost limits
HISTORY_SOFT_COST_BUDGET_USD_PER_EPISODE=1.25
HISTORY_HARD_COST_BUDGET_USD_PER_EPISODE=2.50

# Provider reliability
HISTORY_OPENAI_TIMEOUT_MS=600000
```

Do not commit real secrets.

---

# Workstream 17 — Tests

Add tests covering:

## Configuration

- default low-cost values;
- environment overrides;
- invalid numeric values;
- invalid budget relationships;
- unrelated genres unchanged.

## Model routing

- Luna first pass;
- no unnecessary Terra escalation;
- correct escalation triggers;
- escalation audit record;
- unavailable model fails clearly.

## Search clustering and budgets

- multiple claims grouped into clusters;
- no per-claim search explosion;
- soft limit behavior;
- hard limit behavior;
- per-cluster limit;
- alternate-source limit;
- unresolved preservation after budget exhaustion.

## Source reuse

- same source reused across claims;
- source cache hit;
- source revision after content change;
- metadata-only source rejected for material support.

## Candidate fragment selection

- maximum three fragments per claim;
- source-quality preference;
- stable ranking;
- full document not sent to model.

## Compact output

- output-token ceilings;
- no repeated full claim/evidence text;
- detailed rationale only for exceptional cases.

## Batch API

- job creation;
- stable custom IDs;
- persisted job state;
- partial failure recovery;
- synchronous fallback;
- fixture mode;
- no live paid calls in CI.

## Caching and resumption

- successful batches not repeated;
- interrupted run resumes;
- narrow invalidation;
- broad force warning;
- cost projection before force.

## Cost accounting

- token and search-call accounting;
- soft-budget warning;
- hard-budget stop;
- escalation cost;
- unconfigured pricing behavior;
- no fabricated estimates.

---

# Workstream 18 — One-episode validation

Validate the configuration with Napoleon first:

```bash
EPISODE=history-youtube-history-10-video-story-pack-02-napoleons-invasion-of-russia
```

Before paid work:

```bash
pnpm mediaforge -- history v3.3 config --json

pnpm mediaforge -- history v3.3 extract-claims "$EPISODE" \
  --output-root episodes \
  --live-research \
  --dry-run \
  --json
```

The dry run should report:

- effective Luna-first models;
- escalation model;
- expected extraction batches;
- expected cluster count;
- web-search ceiling;
- evidence-fragment cap;
- cost ceilings;
- cache status;
- Batch API availability.

Then run the real phases:

```bash
pnpm mediaforge -- history v3.3 extract-claims "$EPISODE" \
  --output-root episodes \
  --live-research \
  --json

pnpm mediaforge -- history v3.3 retrieve-sources "$EPISODE" \
  --output-root episodes \
  --live-research \
  --refresh-source \
  --json

pnpm mediaforge -- history v3.3 assess-evidence "$EPISODE" \
  --output-root episodes \
  --live-research \
  --json

pnpm mediaforge -- history v3.3 evaluate-provenance "$EPISODE" \
  --output-root episodes \
  --live-research \
  --json

pnpm mediaforge -- history v3.3 freeze "$EPISODE" \
  --output-root episodes \
  --live-research \
  --json
```

Verify:

- primary semantic operations use Luna;
- Terra is used only for documented escalations;
- search calls remain within budget;
- successful batches are cached;
- assessment candidates are capped;
- cost ledger is populated;
- no material claim is falsely approved;
- unresolved claims remain blocked.

Do not automatically process all three episodes until Napoleon completes successfully and the cost ledger is credible.

---

# Acceptance criteria

## Lowest-cost routing

- [ ] Luna is the default semantic model.
- [ ] Terra is escalation-only.
- [ ] Escalation conditions are deterministic and documented.
- [ ] Ordinary claims do not trigger Terra.
- [ ] Model availability is validated.

## Search cost controls

- [ ] Claims are clustered before search.
- [ ] Default web-search budget is 20 calls.
- [ ] Hard ceiling is 25 calls.
- [ ] Searches per cluster are capped at 2.
- [ ] Alternate-source attempts are capped at 2.
- [ ] Search budgets are visible and enforced.
- [ ] Hard budget exhaustion preserves blockers.

## Source and assessment efficiency

- [ ] Sources are fetched once and reused.
- [ ] Candidate evidence is selected locally.
- [ ] Maximum evidence fragments per claim is 3.
- [ ] Full source documents are not repeatedly sent to models.
- [ ] Compact assessment output is enforced.
- [ ] Detailed rationale is exceptional, not default.

## Batch and caching

- [ ] Batch API is used where supported and cheaper.
- [ ] Safe synchronous fallback exists.
- [ ] Stable custom IDs exist.
- [ ] Successful paid work persists incrementally.
- [ ] Interrupted runs resume.
- [ ] Broad force is discouraged and cost-estimated.
- [ ] Narrow invalidation controls exist.

## Cost accounting

- [ ] Per-call/token/search usage is recorded.
- [ ] Pricing configuration is versioned.
- [ ] Soft and hard episode budgets exist.
- [ ] New paid work stops at hard budget.
- [ ] No cost is fabricated when pricing is unknown.
- [ ] CLI shows current and projected spend.

## Correctness and approval safety

- [ ] Atomic claim quality is preserved.
- [ ] Source quality is preserved.
- [ ] Final provenance remains deterministic.
- [ ] Model confidence cannot authorize approval.
- [ ] Unresolved material claims remain blocked.
- [ ] Maps and diagrams remain evidence-bound.
- [ ] Offline fixture tests remain available.
- [ ] Unrelated genres remain unchanged.

## Validation

- [ ] Focused History tests pass.
- [ ] Typecheck passes.
- [ ] Build passes.
- [ ] Focused lint passes.
- [ ] CLI help/documentation is updated.
- [ ] Napoleon completes live research under configured budgets or reports a concrete external blocker.
- [ ] The final report includes actual observed cost and usage.

---

# Required final report

Provide:

1. changed files grouped by workstream;
2. effective default configuration;
3. model-routing behavior;
4. escalation counts and reasons;
5. web-search budget behavior;
6. cache and Batch API behavior;
7. exact test commands and results;
8. Napoleon dry-run estimate;
9. Napoleon actual:
   - extraction batch count;
   - search call count;
   - source count;
   - evidence count;
   - assessment count;
   - Luna usage;
   - Terra usage;
   - cache hits;
   - estimated cost;
   - pricing version;
   - remaining unresolved claims;
10. known limitations;
11. recommended commands for processing the remaining two episodes.

Do not claim savings without reporting actual token, search-call, retry, and escalation metrics.

---

# Definition of done

This goal is complete when the History V3.3 research pipeline:

- uses Luna for routine semantic processing;
- escalates to Terra only for difficult material cases;
- clusters claims before search;
- enforces hard web-search and cost budgets;
- retrieves and reuses sources locally;
- assesses only a few selected evidence fragments per claim;
- emits compact outputs;
- uses Batch API where supported;
- resumes without repeating paid work;
- reports actual costs;
- preserves all factuality and approval guarantees.
