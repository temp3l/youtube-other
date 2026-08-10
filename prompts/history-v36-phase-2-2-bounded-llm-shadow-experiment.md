# Goal: V3.6 Phase 2.2 — Freeze Deterministic Extraction and Evaluate a Bounded LLM Candidate Proposer

Work in **strict shadow-experiment mode**.

Do not expand to the 40-episode corpus.

Do not modify V3.5 production semantics.

Do not implement V3.6 maps or diagrams.

Do not change the frozen V3.6 relation taxonomy, semantic identity model, evidence fingerprint model, or deterministic validator admission rules.

This task has exactly two objectives:

1. fix the remaining Franklin purpose-vs-destination movement false positive and freeze deterministic extraction;
2. add an OPTIONAL bounded LLM relation-candidate proposer behind the existing deterministic validator and evaluate it on the SAME eight representative episodes.

The LLM is a proposer only.

It must NEVER become semantic authority.

---

# Accepted baselines

Current representative V2 baseline:

```text
V36_REPRESENTATIVE_V2_SHA:
a314d64e453e4abba9ea25ec21faaf8505b9fdcd

V36_REPRESENTATIVE_V2_TAG:
history-v3.6-representative-shadow-v2-baseline
```

Previous representative baseline:

```text
952fa9ee7394eac381b95787b0a85c59c262f887
history-v3.6-representative-shadow-baseline-v6
```

Hardened V3.6 contract baseline:

```text
022f2177cc0e66f47cb5d652d6d456ce12a5a7be
history-v3.6-contract-preflight-baseline
```

Frozen V3.5 production:

```text
f04262c16bfd1a89d1b404b1ac291a89dc699a0d
history-v3.5-frozen-before-v36
```

Accepted V3.5 semantic baseline:

```text
82b4192f6e832523ce00675e39593e3f98a96403
history-v3.5-semantic-baseline
```

Do not reinterpret these.

---

# Representative corpus — EXACTLY unchanged

Run only these eight episodes:

```text
Bronze Age Collapse
Black Death
Franklin Expedition
Spanish Armada
D-Day
1066
Titanic
Chernobyl
```

Resolve actual repository IDs exactly as the V2 run did.

Do not add episodes.

Do not process all 40.

---

# Phase 0 — Mandatory checkpoint

Before edits:

```bash
git status --short
git branch --show-current
git log --oneline --decorate -20
git tag --list 'history-v3.5*'
git tag --list 'history-v3.6*'
git rev-parse HEAD
git rev-parse a314d64e453e4abba9ea25ec21faaf8505b9fdcd
```

Record:

```text
CURRENT_HEAD
V2_BASELINE_SHA
V2_BASELINE_TAG
CONTRACT_BASELINE_SHA
FROZEN_V35_SHA
```

Create an immutable pre-Phase-2.2 checkpoint if absent:

```text
history-v3.6-pre-bounded-llm-shadow-experiment
```

If occupied, create a versioned equivalent.

Do not overwrite existing tags.

Do not use destructive Git commands.

Do not push unless repository policy explicitly permits it.

---

# Part A — Fix Franklin purpose-vs-destination false positive

Known V2 relation:

```text
movement:
Britain -> Northwest Passage
```

derived from language equivalent to:

```text
sailed from Britain to search for the Northwest Passage
```

This is NOT sufficient to establish:

```text
destination = Northwest Passage
```

The infinitive phrase expresses purpose/objective.

The movement relation must fail closed unless separate bounded evidence establishes the actual movement endpoint.

---

# Required deterministic distinction

Reject movement endpoint extraction from purpose-infinitive forms such as:

```text
from X to search for Y
from X to look for Y
from X to find Y
from X to investigate Y
from X to explore Y
from X to attack Y
from X to rescue Y
from X to study Y
from X to locate Y
```

when Y is the grammatical object of the purpose verb rather than a movement destination.

This is a semantic boundary, not a word blacklist.

Implement the smallest deterministic rule compatible with the current structured proposition representation.

Do not create a broad free-text parser.

---

# Positive movement controls

Do NOT regress explicit movement such as:

```text
from X to Y
from X toward Y
from X into Y
from X through Y
from X across Y to Z
departed X and arrived at Y
sailed from X and reached Y
```

when structured claims/entities establish actual transition.

---

# Required Franklin tests

At minimum:

```text
"sailed from Britain to search for the Northwest Passage"
=> NO Britain -> Northwest Passage movement
```

```text
"sailed from Britain to Greenland"
=> movement Britain -> Greenland
```

```text
"sailed from Britain toward Greenland"
=> movement Britain -> Greenland
```

```text
"sailed from Britain to investigate Greenland"
=> NO movement endpoint Greenland unless separately established
```

Keep evidence/provenance explicit.

---

# Freeze deterministic extraction after Part A

After the Franklin fix:

1. rerun all deterministic V3.6 tests;
2. rerun the same eight episodes in deterministic-only mode;
3. capture a new deterministic snapshot;
4. freeze deterministic extraction behavior for the remainder of this task.

Do not add more deterministic extraction heuristics after this point.

If another deterministic recall gap appears during the LLM experiment:

```text
record it
```

Do not patch it in this task.

The purpose of Phase 2.2 is to measure whether a bounded proposer helps beyond the deterministic ceiling.

---

# Part B — Add bounded LLM candidate proposal in SHADOW MODE ONLY

Architecture:

```text
structured claims
+ resolved entities/places
+ small bounded claim window
          │
          ├── deterministic proposer
          │
          └── bounded LLM proposer
                      ↓
             raw V3.6 candidates
                      ↓
          existing deterministic validator
                      ↓
           validated shadow relations
```

The deterministic validator remains authoritative.

The LLM cannot:

```text
approve a relation
bypass a diagnostic
change participant resolution
change semantic IDs
change evidence fingerprints
add relation kinds
invent entities
write V3.5 output
produce maps
produce diagrams
```

---

# LLM proposer activation

Make the LLM proposer explicitly opt-in.

Suggested configuration:

```text
HISTORY_V36_LLM_SHADOW_PROPOSER=1
```

Default:

```text
off
```

Use existing repository configuration conventions if there is already an appropriate feature-flag system.

Do not enable it for production.

Do not change normal V3.5 execution.

---

# Provider integration

Reuse the repository's existing OpenAI / OpenAI-compatible provider abstraction if one exists.

Do NOT create a second generic AI client.

Requirements:

```text
model configurable
timeout bounded
retry bounded
structured output required
no web/research tools
temperature/minimal randomness if configurable
```

Do not hard-code credentials.

Use existing environment/provider configuration conventions.

If no compatible provider abstraction exists:

implement the smallest V3.6-shadow-only seam necessary.

Do not refactor unrelated provider infrastructure.

---

# Model configuration

Do not hard-code a premium model into semantic code.

Expose an existing/configurable model field, conceptually:

```text
HISTORY_V36_RELATION_PROPOSER_MODEL
```

If the repository already has a standard OpenAI model configuration mechanism, reuse it instead.

For tests:

```text
NO live model calls
```

Use deterministic mocked/fixture responses.

Live calls are allowed only for the final controlled eight-episode shadow experiment when explicitly configured.

---

# Cost/token discipline

The LLM proposer must be intentionally cheap.

Never send:

```text
whole episode narration
whole episode plan
all claims
V3.5 review bundle
images
maps
diagrams
unrelated metadata
```

Send only the minimum bounded semantic packet required.

---

# When the LLM may be called

Do NOT call it for every claim.

Use it only for candidate windows where deterministic extraction indicates a meaningful semantic opportunity but cannot safely produce a validated relation.

Prioritize:

```text
rejected deterministic candidate with semantic evidence
bounded adjacent claims with incomplete deterministic projection
manual-review semantic window
known representative recall control
```

Do not call the LLM on claims with no evidence of explanatory semantics.

---

# Hard call budget

Implement explicit per-run limits.

Recommended maximum for this eight-episode experiment:

```text
<= 40 LLM windows total
<= 8 LLM windows per episode
```

Prefer fewer.

Make limits configurable but bounded.

If the budget is exhausted:

```text
record diagnostic
continue deterministically
```

Do not fail the whole shadow run.

---

# Cache

Cache LLM candidate proposals deterministically.

Cache key must include at least:

```text
episode ID
ordered support claim IDs
normalized structured claim content hash
resolved participant bindings hash
relation schema/version
prompt version
model/provider identity
```

Do not include timestamps.

Repeated generation with the same semantic inputs should reuse the cached proposal.

Do not call the provider repeatedly when episodes are regenerated unchanged.

---

# LLM input contract

Provide a compact structured packet.

Conceptually:

```json
{
  "episodeId": "...",
  "claims": [
    {
      "claimId": "...",
      "normalizedProposition": "...",
      "kind": "...",
      "resolvedEntities": [],
      "resolvedPlaces": []
    }
  ],
  "allowedRelationKinds": [
    "movement",
    "spatial-comparison",
    "spatial-area",
    "causal",
    "dependency",
    "process",
    "temporal-sequence",
    "policy-response",
    "evidence-set"
  ]
}
```

Use actual repository field names.

Do not expose unrelated episode data.

---

# LLM output contract

Require strict structured output.

The proposer may return:

```text
0..N candidate proposals
```

Each proposal must contain only enough information to construct a V3.6 candidate:

```text
relation kind
candidate participants using supplied canonical IDs
support claim IDs
short machine-readable rationale/evidence mapping if needed
```

The LLM must not invent raw entity/place IDs.

Participants must reference only IDs supplied in the input packet.

If output references an unknown participant:

```text
reject before validator
record diagnostic
```

---

# Strong instruction to proposer

The proposer prompt must explicitly say:

```text
Do not use historical knowledge.
Do not infer facts not stated in the provided claims.
Do not treat co-occurrence as a relation.
Do not convert purpose into destination.
Do not infer causality from chronology.
Do not infer movement from opposition/comparison.
Do not split proper names.
Return no candidate if evidence is insufficient.
```

---

# No hidden semantic authority

Never accept:

```text
LLM confidence
LLM explanation
LLM self-rating
```

as validation evidence.

Only the deterministic V3.6 validator decides admission.

If needed, the LLM rationale may be retained for debugging but must not affect acceptance.

---

# Candidate source type

Extend the typed shadow source only if required.

Current sources:

```text
structured-claim-projection
bounded-adjacent-claim-projection
```

Add exactly one new source:

```text
bounded-llm-claim-projection
```

Do not add additional LLM-source variants.

---

# LLM candidate diagnostics

Add only narrowly necessary diagnostics.

Examples:

```text
SHADOW_LLM_OUTPUT_SCHEMA_INVALID
SHADOW_LLM_UNKNOWN_PARTICIPANT
SHADOW_LLM_SUPPORT_CLAIM_OUT_OF_WINDOW
SHADOW_LLM_CALL_BUDGET_EXHAUSTED
SHADOW_LLM_PROVIDER_FAILURE
```

Reuse deterministic validator diagnostics after candidate construction.

Do not duplicate them.

---

# LLM failure behavior

Provider error:

```text
fail open to deterministic-only shadow output
```

Meaning:

```text
record LLM diagnostic
do not create candidate
continue run
```

Never block V3.5 or normal history generation because shadow LLM proposal failed.

---

# Live experiment modes

Support at least:

```text
deterministic-only
deterministic-plus-llm
```

Run BOTH modes on the exact same representative corpus.

Use identical underlying frozen claim/entity inputs.

---

# Required controlled comparison

For each episode compare:

```text
deterministic-only candidates
deterministic-only validated relations

LLM proposals
LLM proposals rejected before validator
LLM proposals rejected by validator
LLM proposals validated

combined deduplicated validated relations
```

Use semantic relation IDs to collapse overlaps.

---

# Attribution

For every combined validated relation report:

```text
deterministic only
LLM only
both
```

If both propose the same semantic relation:

```text
ONE semantic relation
```

with deterministic evidence merge.

Do not double-count.

---

# Representative semantic controls

The goal is NOT to force these relations to exist.

The goal is to evaluate whether the LLM can recover semantics safely.

---

## Black Death

Evaluate windows involving:

```text
labour scarcity
wage pressure
policy response / wage restriction
```

Determine whether bounded LLM proposal can recover:

```text
causal:
labour scarcity -> wage pressure
```

and/or:

```text
policy-response:
wage pressure -> wage restriction
```

ONLY if supplied claims establish them.

---

## Spanish Armada

Evaluate route/movement windows.

The LLM must not infer:

```text
Lisbon -> English Channel
```

merely from:

```text
departed Lisbon
mission involved English Channel
```

It may propose movement only if the supplied bounded claims establish the transition.

---

## 1066

Evaluate landing/campaign windows.

Do NOT recreate:

```text
Europe -> England -> King Edward
```

in any relation form.

Do not invent an origin for Pevensey landing.

---

## Franklin

The fixed deterministic rule must prevent:

```text
Britain -> Northwest Passage
```

from purpose-only language.

The LLM proposer must also be explicitly tested against the same trap.

If it proposes the false movement:

```text
validator/pre-validator must reject it
```

and record why.

---

## Titanic

Ensure the existing corrected:

```text
ice -> Californian stopping
```

behavior remains stable.

The LLM should not add redundant or broader unsupported causal relations.

---

## D-Day

Preserve:

```text
Normandy vs Pas-de-Calais
```

as spatial comparison.

Do not invent movement endpoints for unresolved beaches/coast unless claim/entity inputs explicitly establish both endpoints.

---

## Bronze Age / Chernobyl

Use primarily as false-positive stability controls.

Do not expect more relation count.

---

# No LLM historical knowledge

This experiment is NOT research.

The proposer must work exclusively from supplied claims/entities.

No:

```text
web search
retrieval augmentation
historical database
Wikipedia
external source retrieval
```

Do not add research dependencies.

---

# Prompt versioning

Version the bounded proposer prompt explicitly.

Example:

```text
history-v36-relation-proposer-v1
```

Include prompt version in:

```text
cache key
provenance
review artifact
```

Do not embed an unversioned prompt string without provenance.

---

# Prompt design

Keep it short.

Prefer:

```text
role
allowed relation taxonomy
strict evidence rules
input JSON
output JSON schema
```

Do not include large historical examples.

Use the golden semantic principles as concise negative/positive constraints.

---

# Determinism expectations

Live LLM output may not be byte-identical.

But after:

```text
schema parsing
canonicalization
deterministic validation
semantic deduplication
```

record whether repeated live runs converge on the same validated semantic IDs.

Do NOT require this as a hard blocker if the provider is inherently nondeterministic.

Cache should make normal repeated generation deterministic after first successful proposal.

---

# Required cache test

Prove:

```text
same semantic input
=> one provider call
=> later call reuses cache
```

Also prove changing:

```text
prompt version
model
claim contents
resolved participant bindings
schema version
```

invalidates the cache key.

---

# Security/privacy

Do not send:

```text
API keys
environment secrets
filesystem paths
Git metadata
user information
```

to the model.

Only send bounded episode semantic data needed for proposal.

---

# Differential assessor

Keep the corrected V2 model:

```text
presence classification
!=
semantic assessment
```

Do not regress to version-based correctness assumptions.

For LLM-only validated relations:

```text
presenceClassification
semanticAssessment
candidateSource
supportClaimIds
validator result
```

must be explicit.

---

# Semantic assessment

Use current V2 claim-grounded assessment.

The fact that an LLM proposed something must never imply:

```text
supported-by-current-claims
```

That assessment must come from deterministic support validation.

---

# Manual review set

Include all:

```text
LLM-only validated relations
LLM candidate rejected for semantic reason
deterministic vs LLM disagreement
purpose-vs-destination cases
semantic conflicts
taxonomy-extension-required
cannot-assess-deterministically
needs-manual-review
```

Also include a small deterministic sample of:

```text
both proposers agree
```

---

# Success criteria for LLM experiment

Do NOT use:

```text
more relations = success
```

Measure:

```text
new validated claim-supported relations
false proposals rejected
unsupported proposals admitted
semantic conflicts
duplicate semantic IDs
directionality/cardinality violations
cross-episode leakage
proper-name fragmentation
purpose-as-destination errors
provider calls
cache hits
tokens/cost if available
```

The most important hard requirement:

```text
unsupported validated relations = 0
```

---

# Decision framework after experiment

The review artifact should explicitly support one of:

```text
A. LLM proposer adds useful validated recall with no new semantic safety failures
   -> candidate for broader shadow evaluation

B. LLM proposer adds little/no useful recall
   -> keep deterministic-only

C. LLM proposer produces too many unsafe/ambiguous candidates
   -> reject LLM approach

D. Upstream structured claims/entity resolution are the dominant bottleneck
   -> improve upstream representation before broader extraction
```

Do not make the production cutover decision in this task.

---

# No all-40 rollout

Even if the experiment looks good:

```text
STOP after the same eight episodes
```

Do not process all 40.

Do not automatically enable LLM proposal elsewhere.

---

# V3.5 isolation

V3.5 production files must remain untouched.

If shared code is unexpectedly required:

stop and report the dependency.

Prefer V3.6-only modules.

Do not regenerate the V3.5 40-episode review bundle.

---

# Suggested module boundaries

Reuse current repository structure.

Conceptually:

```text
packages/history/src/v36/
  representative-shadow-extraction-v36.ts
  bounded-llm-relation-proposer-v36.ts
  relation-proposer-cache-v36.ts
```

Use existing naming conventions.

Do not create unnecessary abstractions.

---

# Tests

Follow risk-based validation.

Run in order:

1. existing V3.6 schema tests;
2. relation IR/invariant tests;
3. existing 45 golden fixtures;
4. Franklin purpose/destination regression tests;
5. deterministic representative extractor tests;
6. LLM input packet tests;
7. LLM structured-output parsing tests;
8. unknown-participant rejection tests;
9. out-of-window support rejection tests;
10. provider-failure fail-open tests;
11. call-budget tests;
12. cache determinism/invalidation tests;
13. semantic dedup across deterministic+LLM tests;
14. representative comparison tests using mocked LLM fixtures;
15. affected package typecheck;
16. targeted lint;
17. deterministic-only eight-episode run;
18. live deterministic+LLM eight-episode run if configured;
19. artifact schema/checksum verification.

Do not run unrelated full repository suites.

---

# Live provider execution

Before making paid calls:

verify:

```text
feature flag explicitly enabled
API/provider configuration present
model configured
call budget configured
```

If any are absent:

```text
do not fail implementation
generate fixture/mock review evidence
report live experiment NOT RUN
```

Do not invent credentials.

Do not expose secrets.

---

# Cost reporting

If provider returns token usage:

record aggregate only:

```text
calls
input tokens
output tokens
total tokens
estimated cost if repository already has pricing metadata
```

Do not hard-code possibly stale provider pricing.

If cost cannot be calculated reliably:

report token counts without guessing cost.

---

# Review artifact

Generate:

```text
history-v3.6-bounded-llm-shadow-review-YYYYMMDDTHHMMSSZ.zip
```

Use current artifact conventions.

Include at least:

```text
README.md
experiment-summary.json
deterministic-baseline.json
deterministic-vs-llm.json
episode-results/
manual-review.json
diagnostic-summary.json
llm-call-summary.json
cache-summary.json
test-summary.json
invariant-test-summary.json
provenance.json
checksums.sha256
```

Do not include large unrelated approval packs.

---

# Artifact provenance

Use the current V3.6 shadow provenance schema/versioning rules.

Include explicit:

```text
v36ImplementationCommitSha
representativeV2BaselineCommitSha
contractBaselineCommitSha
frozenV35ProductionCommitSha
acceptedV35SemanticBaselineCommitSha
promptVersion
model/provider identity if live experiment ran
episodeSet
artifactKind
generatedAt
```

Artifact kind should be dedicated to this experiment, e.g.:

```text
history-v3.6-bounded-llm-shadow-review
```

Version schema if required.

---

# Required episode metrics

For each episode:

```text
claims inspected
deterministic candidates
deterministic valid
LLM windows requested
provider calls
cache hits
LLM proposals
LLM pre-validation rejects
LLM validator rejects
LLM validated
combined unique validated
deterministic-only semantic IDs
LLM-only semantic IDs
both semantic IDs
manual-review items
```

---

# Required aggregate metrics

Report:

```text
total bounded windows considered
LLM calls
cache hits
LLM proposals
LLM proposal schema failures
unknown participant proposals
out-of-window support proposals
LLM validator rejections
LLM validated relations
new claim-supported LLM-only validated relations
unsupported validated relations
semantic duplicates collapsed
cross-episode violations
directionality violations
cardinality violations
proper-name fragmentation
purpose-as-destination errors
```

---

# Required Franklin comparison

Report before/after explicitly:

```text
V2:
Britain -> Northwest Passage
status: validated / needs-manual-review

Phase 2.2 deterministic:
expected: absent/rejected from purpose-only proposition

Phase 2.2 LLM:
proposal?
validator result?
diagnostic?
```

This is a hard semantic control.

---

# Safe parallelism

Use:

```text
ONE primary writer
```

for shared proposer/extractor code.

Optional read-only parallel agents:

### Agent A
Franklin purpose/destination rule and deterministic regression audit.

### Agent B
LLM prompt/input/output contract and cache review.

### Agent C
Representative differential/manual-review experiment analysis.

No parallel agent may independently rewrite shared V3.6 extraction logic.

---

# Token discipline

Keep implementation and experiment cheap:

```text
same 8 episodes
max 40 live LLM windows
max 8 per episode
bounded claim windows only
cache all successful calls
no full narration
no web
no image review
no all-40 run
no V3.5 regeneration
```

Do not increase budgets merely to obtain more relations.

---

# Explicit anti-goals

Do NOT:

- modify V3.5 production behavior;
- process all 40 episodes;
- add V3.6 map compiler;
- add V3.6 diagram compiler;
- change relation taxonomy;
- change semantic IDs;
- change evidence fingerprints;
- weaken validators;
- add historical research;
- send whole episodes to the model;
- add broad NLP heuristics;
- use LLM output as validation;
- enable LLM proposer by default;
- integrate the LLM proposer into production;
- regenerate narration;
- regenerate images;
- regenerate audio;
- change localization;
- change FFmpeg rendering.

---

# Completion checkpoint

After all required tests pass:

Create commit:

```text
feat(history): evaluate bounded v3.6 llm relation proposals
```

Record full SHA.

Create immutable annotated tag:

```text
history-v3.6-bounded-llm-shadow-baseline
```

If occupied, create a versioned equivalent.

Do not overwrite previous tags.

Generate the timestamped review artifact from this exact commit.

Do not push unless repository policy explicitly permits it.

---

# Required completion report

Return:

1. Starting SHA/tag.
2. V2 representative baseline SHA/tag.
3. Contract baseline SHA/tag.
4. Frozen V3.5 SHA/tag.
5. Franklin deterministic bug root cause.
6. Franklin fix.
7. Deterministic-only post-fix representative metrics.
8. Confirmation deterministic extraction frozen after Franklin fix.
9. LLM proposer module paths.
10. Provider/client reused.
11. Feature flag/config.
12. Model configuration field.
13. Prompt version.
14. Maximum claim-window size.
15. LLM-call eligibility rule.
16. Per-run/per-episode call limits.
17. Cache location/strategy.
18. Cache-key fields.
19. Candidate source type.
20. Pre-validator checks.
21. New diagnostics.
22. Tests added.
23. Golden fixture result.
24. Invariant result.
25. Per-episode deterministic vs LLM metrics.
26. LLM-only validated relation count.
27. Both-proposer relation count.
28. Deterministic-only relation count.
29. Unsupported validated relation count.
30. Purpose-as-destination error count.
31. Semantic duplicate count.
32. Cross-episode violation count.
33. Directionality/cardinality/proper-name violation counts.
34. Manual-review set size.
35. Provider call count.
36. Cache hit count.
37. Token usage if available.
38. Typecheck/lint result.
39. Confirmation V3.5 untouched.
40. Final commit SHA.
41. Immutable tag.
42. Review artifact path.
43. Artifact SHA-256/checksum result.
44. Recommended next decision only — do not execute it.

---

# Acceptance criteria

Complete only when all are true:

## Franklin deterministic fix

- [ ] Purpose-infinitive target is not treated as movement destination.
- [ ] `Britain -> Northwest Passage` no longer validates from purpose-only language.
- [ ] Explicit genuine movement controls still pass.
- [ ] Deterministic extractor is frozen after this fix.

## LLM boundary

- [ ] LLM proposer is shadow-only.
- [ ] Default is disabled.
- [ ] Same eight episodes only.
- [ ] Small bounded claim windows only.
- [ ] No whole-episode narration sent.
- [ ] Only supplied canonical participant IDs may be returned.
- [ ] Strict structured output enforced.
- [ ] Existing deterministic validator is unchanged and authoritative.
- [ ] LLM confidence/explanation cannot approve anything.
- [ ] Provider failure does not affect V3.5 or deterministic shadow output.

## Cost/caching

- [ ] Per-run call cap exists.
- [ ] Per-episode call cap exists.
- [ ] Successful proposal calls are cached.
- [ ] Same semantic input reuses cache.
- [ ] Prompt/model/schema/content changes invalidate cache.
- [ ] No repeated paid call for unchanged cached window.

## Semantic safety

- [ ] Unsupported validated relations = 0.
- [ ] Purpose-as-destination validated errors = 0.
- [ ] Duplicate semantic IDs = 0.
- [ ] Cross-episode support violations = 0.
- [ ] Directionality violations = 0.
- [ ] Cardinality violations = 0.
- [ ] Valid proper-name fragmentation = 0.
- [ ] Unknown-participant LLM proposals cannot enter validator as valid.
- [ ] Out-of-window support claims cannot be used.

## Experiment

- [ ] Deterministic-only mode rerun on same eight episodes.
- [ ] Deterministic+LLM mode evaluated on same eight episodes.
- [ ] Semantic IDs used for overlap/dedup.
- [ ] LLM-only vs deterministic-only vs both are reported.
- [ ] Manual-review set contains all LLM-only validated relations.
- [ ] Black Death recall controls evaluated.
- [ ] Spanish Armada route controls evaluated.
- [ ] 1066 negative controls preserved.
- [ ] Franklin purpose/destination trap evaluated for both proposers.
- [ ] Titanic/D-Day/Bronze Age/Chernobyl remain stability controls.

## Scope

- [ ] No 40-episode rollout.
- [ ] No map compiler.
- [ ] No diagram compiler.
- [ ] No V3.5 semantic changes.
- [ ] No production LLM integration.
- [ ] No taxonomy expansion.
- [ ] No validator weakening.
- [ ] No external historical research.

## Artifact

- [ ] Successful state committed.
- [ ] Immutable bounded-LLM shadow tag created.
- [ ] Dedicated timestamped experiment artifact generated.
- [ ] Provenance records prompt/model/provider/config.
- [ ] Checksums and ZIP integrity pass.

Stop after this experiment.

Do not automatically proceed to all-40 shadow extraction.

The next decision must be based on review of the bounded-LLM shadow artifact.
