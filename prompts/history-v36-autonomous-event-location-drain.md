# History V3.6 — Autonomous Event-Location Taxonomy Extension + Semantic Drain

## Goal

Continue the accepted History V3.6 semantic architecture from the latest autonomous modality baseline.

The first task is to implement the approved narrow relation taxonomy extension:

```text
event-location
```

for the exact D-Day taxonomy-gap case.

After the event-location contract is proven safe:

```text
contract
→ validator support
→ deterministic candidate projection
→ same-eight admission
→ focused validation
→ commit/tag/artifact
```

Then continue autonomously through subsequent **mechanical, evidence-backed** phases until:

```text
a genuine HUMAN DECISION GATE
or
the run cap
```

Do not stop after every successful micro-phase merely to request another prompt.

---

# Starting baseline

Latest accepted autonomous modality run:

```text
FINAL_HEAD:
003da5e02f0a21a16132c5d4163ae3a376f92335

TAG:
history-v3.6-modal-causal-admission-baseline
```

Prior accepted relevant baselines:

```text
Phase 2.19:
modal causal admission

Phase 2.18:
causal modality contract

Phase 2.17:
proof-aware policy-response admission

Phase 2.15:
900be4197a81c976e85737fe49088538a3d60a15
history-v3.6-policy-response-modality-contract-baseline-v2

Phase 2.13:
d540477cb865bb0dcb8e27c17ce9235ee8833c43

Phase 2.12:
9535fabc47a50331d2b8412b34c594055e1f61c3
```

Frozen V3.5:

```text
commit:
f04262c16bfd1a89d1b404b1ac291a89dc699a0d

tag:
history-v3.5-frozen-before-v36

annotated tag object:
149a2d160b140d13a97f66155a4b8705f6adf652
```

Use Git as authority.

Resolve full SHAs/tags before implementation.

Never move or overwrite an accepted immutable tag.

---

# Current remaining-gap state

The latest accepted autonomous run reported:

```text
remaining gaps: 6
```

Categories:

```text
2  NEEDS_ADDITIONAL_NATIVE_STRUCTURE
1  movement/modality block
1  TAXONOMY_MISMATCH
2  INTENTIONALLY_NON_RELATIONAL
```

Treat repository artifacts as authoritative and reconcile this exact state before work.

The taxonomy mismatch is:

```text
candidate-gap-claim-7552fcb5134857307769fa18
```

Resolve exact episode/claim/structured/atomic IDs from repository artifacts.

The accepted human decision is:

> Add a narrowly typed `event-location` relation kind with explicit assertion modality and an event/action/operation-like subject restriction.

Do not reopen the taxonomy decision unless repository evidence materially contradicts the accepted case.

---

# Approved event-location semantics

The known D-Day source semantics are conceptually:

```text
"A vast deception operation attempted to convince Germany
that the main invasion would strike near Calais."
```

Current grounded semantics:

```text
predicate: located-in
subject: main invasion
location: Calais
assertionStatus: intended
```

Repository IDs/spans are authoritative.

Do not use this prose summary as identity or evidence.

---

# Required new relation kind

Add:

```text
event-location
```

with the minimum semantic shape required by the source-supported case.

Conceptually:

```ts
event-location {
  event
  location
  assertionStatus
}
```

Use exact repository naming/type conventions.

Do not add a generic:

```text
subject-location
```

relation.

Do not generalize all `located-in` atoms into relations.

---

# Core semantics

`event-location` means:

> A canonical event/action/operation-like concept is explicitly located, planned, intended, attempted, uncertain, or asserted with respect to a canonical location.

For the approved D-Day case:

```text
event = main invasion
location = Calais
assertionStatus = intended
```

It does NOT mean:

```text
movement to Calais
origin/destination route
spatial comparison
generic entity locator
event causality
```

---

# Event-subject restriction

The subject must be a canonical concept representing an event/action/operation-like semantic object.

Do not allow arbitrary:

```text
person
army
country
artifact
object
organization
generic noun
```

merely because it has a location.

Use existing canonical concept/entity metadata if available.

If no authoritative event-like classification exists:

introduce the smallest typed eligibility mechanism justified by the exact case.

Do NOT add regex/event-name guessing.

If event-subject eligibility cannot be determined deterministically:

HUMAN DECISION GATE.

---

# Location requirement

`location` must be:

```text
canonical
resolved
episode-local support valid
```

No raw strings.

No substring place detection.

No unresolved place IDs.

---

# Assertion modality

Use the existing canonical:

```text
AtomicAssertionStatusV36
```

or exact current authoritative assertion-status type.

`event-location` must preserve explicit modality.

For the D-Day case:

```text
assertionStatus = intended
```

Do not normalize it to:

```text
asserted
```

Missing assertion semantics must have a deterministic legacy/default rule only if required by schema design.

Because this is a new relation kind, prefer explicit assertion status rather than implicit legacy defaults.

---

# Semantic identity

The relation semantic ID must include semantically meaningful:

```text
episodeId
kind = event-location
event participant
location participant
assertionStatus
```

Non-default modality is semantic.

Evidence provenance is not semantic identity.

Changing:

```text
intended
```

to:

```text
asserted
```

must produce a semantically distinct relation identity.

---

# Evidence fingerprint

Reuse existing V3.6 evidence fingerprint architecture.

Include:

```text
claim IDs
structured proposition IDs
atomic grounding IDs
source spans/hashes
```

as provenance/evidence inputs.

Do not put artifact timestamps into semantic identity.

---

# Direction

Relation direction is:

```text
event -> location
```

Do not canonicalize as unordered.

Reversing participant roles must fail validation or produce a semantically different invalid relation.

---

# Relation schema/versioning

Update the authoritative:

```text
ExplanatoryRelationV36
```

runtime schema.

Regenerate:

```text
docs/history/v3.6/relation-schema.json
```

mechanically.

Update supplemental contract documentation if current repository conventions require it.

Version relation schema appropriately.

Do not hand-edit generated JSON Schema.

---

# Validator

Extend the deterministic relation validator with explicit support for:

```text
event-location
```

Do NOT weaken existing validation.

Required checks:

```text
kind == event-location
event participant resolved
location participant resolved
event-like subject eligibility
valid assertion status
event != location
source support valid
same episode
direction preserved
no movement-role misuse
no comparison-role misuse
```

---

# Candidate projection

Only after contract/validator tests pass:

add ONE direct projector for the approved atomic shape.

Conceptually:

```text
atomic located-in(event, location)
with eligible event-like subject
and explicit assertion status

→ event-location candidate
```

Use a stable versioned rule such as:

```text
atomic-located-in-event-location-candidate.v1
```

or exact repository-convention equivalent.

Do not add generic:

```text
located-in -> relation
```

projection.

---

# Candidate eligibility

Require all:

```text
atomic predicate == located-in
native or otherwise explicitly approved lineage according to current architecture
subject is canonical/resolved
subject is deterministically event/action/operation-like
location is canonical/resolved
assertionStatus valid
source lineage valid
same episode
```

Fail closed.

---

# D-Day positive case

The approved positive case must become:

```text
event-location

event:
main invasion

location:
Calais

assertionStatus:
intended
```

only if:

```text
contract valid
projector direct
validator accepts
all invariants remain zero
```

Do not alter claim semantics to make it pass.

---

# Critical negative control — 1066

The existing intentionally non-relational locator case conceptually:

```text
"an army ... in England"
```

must remain non-relational.

This proves the new rule is NOT:

```text
generic subject-location
```

Add a hard regression test.

The 1066 subject must fail event-location eligibility unless the authoritative structured semantics explicitly classify the located subject as an event/action/operation.

Do not special-case by episode/title.

---

# Other generic locator negatives

Add/reuse negative controls for:

```text
person located in place
army/entity located in place
artifact located in place
organization located in place
generic descriptive locator
```

No event-location relation unless subject eligibility is explicit and source-supported.

---

# Movement separation

Hard invariant:

```text
event-location != movement
```

Do not derive:

```text
origin
destination
via
route
```

from event-location semantics.

For D-Day:

```text
intended invasion near Calais
```

does NOT imply movement to Calais.

---

# Comparison separation

Hard invariant:

```text
event-location != spatial-comparison
```

Do not reuse comparison participants/roles.

---

# Causality separation

Hard invariant:

```text
event-location != causal
```

Location does not imply cause/effect.

---

# Human-approved taxonomy scope

This run is authorized to add ONLY:

```text
event-location
```

No other relation kinds.

If another taxonomy mismatch appears:

HUMAN DECISION GATE.

---

# Phase sequencing

Start with the next sequential phase after 2.19.

Expected:

```text
Phase 2.20:
event-location contract + validator prototype

Phase 2.21:
event-location candidate projection + D-Day admission
```

If Phase 2.20 proves the design unsafe:

stop.

If both succeed:

continue autonomously to reassess the remaining non-taxonomy backlog under the rules below.

---

# Post-admission remaining backlog

After successful D-Day admission, recompute exact gap inventory.

Expected broad categories may include:

```text
2 native-structure movement cases
1 movement/modality block
2 intentionally non-relational
```

Do not assume counts.

Use repository artifacts.

---

# Native-structure movement cases

Known controls:

## Franklin

Do not infer:

```text
Northwest Passage = destination
```

when it is an objective.

If no explicit destination exists:

leave relation absent.

## Spanish Armada

Do not infer a destination merely from:

```text
sailed from Lisbon
```

or intended mission semantics.

If no canonical destination exists:

leave relation absent.

A gap that cannot be resolved from source semantics may be reclassified:

```text
INTENTIONALLY_UNREPRESENTABLE
```

or repository-equivalent terminal state, but do not invent a new taxonomy casually.

---

# Armada movement/modality block

The latest autonomous run reported an Armada movement case blocked because movement lacked the required actor/complete route shape.

Do not solve by:

```text
loosening movement cardinality
inventing actor
inventing destination
treating intent as completed route
```

Inspect whether accepted upstream structure now contains complete semantics.

If not:

leave blocked.

If resolution requires a new movement contract architecture with multiple credible options:

HUMAN DECISION GATE.

---

# Terminal non-relational items

The existing two intentionally non-relational cases are terminal unless repository semantics materially changed.

Do not treat them as defects.

At the end, distinguish:

```text
actionable gaps
terminal/non-relational items
```

---

# Autonomous run cap

Complete at most:

```text
5 new phases
```

starting after Phase 2.19.

Expected maximum:

```text
2.20 through 2.24
```

Stop sooner at a HUMAN DECISION GATE.

---

# HUMAN DECISION GATES

STOP if:

## Gate A — multiple credible architectures

Repository evidence does not clearly choose between materially different designs.

## Gate B — accepted semantic change

Progress would alter accepted relation semantics, IDs, proof identity, evidence fingerprint rules, or V3.5 behavior.

## Gate C — validator weakening

Any progress requires weakening safety.

## Gate D — additional taxonomy expansion

Any new relation kind beyond `event-location` becomes necessary.

## Gate E — live semantic generation

Progress requires provider/LLM calls.

## Gate F — repeated failure

Same semantic defect fails twice.

## Gate G — risky broad migration

Next meaningful step is a broad all-40 semantic migration/release gate with non-trivial churn risk.

---

# No heuristic regression

Never implement:

```text
generic located-in -> event-location
purpose as destination
intent as completed movement
chronology as causality
comparison as movement
proximity as proof
generic verb -> relation
proper-name substring entity resolution
synthetic grouping metadata as fact
```

Typed upstream semantics remain authoritative.

---

# All-40 policy

Do NOT immediately run a mutating all-40 migration.

A read-only all-40 census MAY be run late in the autonomous sequence if:

```text
same-eight passes
event-location behavior is frozen
no relation-ID churn is detected
the census is useful for deciding release readiness
```

Do not admit new all-40 relations automatically unless covered by already accepted direct rules and migration risk is demonstrably low.

If broad corpus semantics would materially change:

Gate G.

---

# Per-phase workflow

For every phase:

## 1. Preflight

```text
git status
HEAD
latest accepted tag
affected package typecheck
directly relevant tests
```

## 2. Small evidence packet

Record:

```text
target case IDs
current semantic layer
missing boundary
approved semantic interpretation
forbidden inference
```

## 3. Implement smallest change

One semantic concern per phase.

## 4. Focused validation

Run:

```text
History typecheck
targeted ESLint
direct tests
45 golden fixtures if relation/schema touched
same-eight deterministic regression when relevant
```

No unrelated full-repo suites.

## 5. Hard invariant gate

All applicable must remain zero:

```text
unsupported validated relations
duplicate semantic IDs
cross-episode support
directionality violations
cardinality violations
proper-name fragmentation
purpose-as-destination
chronology-to-causality
process-to-causality
modality loss
modality strengthening
wrong-premise modality
generic locator overgeneration
entity-locator misclassified event-location
event-location misclassified movement
unresolved participant admission
legacy relation semantic drift
unexpected relation-ID churn
unexpected evidence-fingerprint churn
V3.5 semantic changes
```

## 6. Self-review

Explicitly answer:

```text
Did this solve only the intended layer?
Did it create generic located-in inference?
Did any non-event locator become a relation?
Did validator strictness weaken?
Did legacy semantics drift?
Did unrelated gaps change?
```

## 7. Commit + immutable tag

One successful semantic phase per commit where practical.

Use:

```text
history-v3.6-<purpose>-baseline
```

with version suffix if occupied.

Never overwrite tags.

## 8. Compact artifact

Generate:

```text
artifacts/shadow/history-v3.6/
history-v3.6-<purpose>-review-<timestamp>.zip
```

Minimum:

```text
README.md
decision-report.md
target-case-summary.json
before-after.json
test-summary.json
invariant-summary.json
provenance.json
checksums.sha256
```

Include schema/manual-review when relevant.

## 9. Continue

Derive next smallest safe phase and continue automatically unless at a gate.

---

# Consolidated journal

Append to:

```text
docs/reports/codex-runs/
2026-08-09-history-v36-autonomous-event-location-drain.md
```

For each phase:

```text
phase
start SHA
target
change
before/after
invariants
commit
tag
artifact
next
```

Keep concise.

---

# Final consolidated artifact

Generate:

```text
history-v3.6-autonomous-event-location-drain-review-<timestamp>.zip
```

Include:

```text
README.md
phase-index.json
event-location-summary.json
remaining-gap-inventory.json
final-relation-summary.json
final-test-summary.json
final-invariant-summary.json
human-decision-gate.json if applicable
provenance.json
checksums.sha256
```

Reference per-phase artifacts instead of embedding them.

---

# Parallelism

One primary writer only.

Read-only/disjoint subagents may inspect:

```text
relation schema compatibility
event-subject eligibility
negative locator controls
remaining-gap inventory
```

Do not concurrently edit canonical relation schema/validator.

---

# Token discipline

Prefer:

```text
exact rg/find
small targeted file reads
reuse existing artifacts
bounded gap inspection
machine-readable summaries
focused tests
```

Avoid:

```text
full repo rereads
full episode dumps
repeated architecture prose
large duplicate approval packs
```

---

# Provider policy

Hard:

```text
provider calls = 0
LLM semantic calls = 0
```

Stop at Gate E if live semantics become necessary.

---

# V3.5 policy

V3.5 remains immutable.

No changes to:

```text
claims
relations
planning
rendering
hashes
approval packs
```

---

# Stop conditions

Stop when any is true:

```text
human decision gate reached
5-phase cap reached
all actionable non-taxonomy gaps resolved/terminal
next work is broad risky all-40 migration
next work is visual/compiler implementation
```

---

# Final response format

Return one compact consolidated summary:

```text
AUTONOMOUS EVENT-LOCATION RUN:
PASS / STOPPED_AT_GATE / PARTIAL

phases completed:
- phase — purpose — commit — tag — result

event-location:
contract result
D-Day admission result
semantic relation ID if accepted

net semantic change:
candidates A -> B
validated relations A -> B
remaining actionable gaps A -> B

terminal/non-relational:
N

hard invariants:
all zero / exact exception

V3.5:
unchanged

provider/LLM calls:
0

final HEAD:
...

final tag:
...

consolidated artifact:
...

remaining gaps:
...

human decision required:
yes/no

if yes:
gate + 2-3 bounded options + recommended choice
```

Do not stop after a successful phase merely to request another prompt.

Begin from:

```text
history-v3.6-modal-causal-admission-baseline
```

and execute the approved `event-location` taxonomy extension first.
