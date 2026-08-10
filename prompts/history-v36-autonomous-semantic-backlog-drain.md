# History V3.6 — Autonomous Semantic Backlog Drain

## Goal

Continue the accepted History V3.6 semantic architecture from the latest frozen baseline **autonomously across multiple bounded phases**.

Do not stop after every successful micro-phase merely to ask for another prompt.

Instead:

```text
inspect accepted baseline
→ choose smallest evidence-backed next phase
→ implement/prototype
→ focused validation
→ self-review
→ commit
→ immutable tag
→ compact review artifact
→ derive next phase
→ continue
```

Continue until a genuine HUMAN DECISION GATE is reached or the bounded run cap is reached.

---

# Starting baseline

Current accepted Phase 2.15:

```text
COMMIT:
900be4197a81c976e85737fe49088538a3d60a15

TAG:
history-v3.6-policy-response-modality-contract-baseline-v2
```

Prior accepted baselines include:

```text
Phase 2.14:
e1525f732ecd3776304c38b3bf18eb761e065714

Phase 2.13:
d540477cb865bb0dcb8e27c17ce9235ee8833c43

Phase 2.12:
9535fabc47a50331d2b8412b34c594055e1f61c3

Phase 2.11:
ce6cc44f476d3ab650703f23af5b7ee4a68c7695

Phase 2.10:
a63de8f5a30db4ede6e82ece0f8f87ba45032145

Phase 2.9:
abad7c25286b82b738933702bd1b3a1f69fa39bb
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

Use Git as authority and resolve/verify every baseline before work.

Never move an accepted immutable tag.

---

# Current architectural state

Phase 2.15 selected the minimal policy-response modality extension:

```text
Option A:
policy-response-specific per-premise modality
```

Current prototype can losslessly represent:

```text
conditionAssertionStatus = uncertain
responseAssertionStatus  = attempted
```

while preserving legacy policy-response behavior:

```text
missing modality => asserted/asserted
```

Existing relation IDs and evidence fingerprints remain stable for legacy semantics.

The Black Death proof has NOT yet been admitted as a relation.

The next known architectural boundary is:

```text
validated CrossClaimProofV36
        ↓
proof-aware relation evidence bridge
        ↓
modality-preserving policy-response candidate/relation
        ↓
deterministic validation
```

Start there unless repository evidence proves the baseline has changed.

---

# Autonomous run policy

Do not ask for another prompt after a successful bounded phase.

After every phase:

1. validate;
2. self-review against the phase acceptance criteria;
3. commit successful state;
4. create immutable phase tag;
5. generate compact review artifact;
6. inspect remaining semantic gaps;
7. select the next smallest evidence-backed task;
8. continue.

Maintain phase numbering sequentially from:

```text
Phase 2.16
```

Do not skip numbers.

---

# Hard run cap

This autonomous run may complete at most:

```text
6 new phases
```

for example:

```text
2.16 through 2.21
```

Stop sooner at a HUMAN DECISION GATE.

The cap prevents an unbounded architecture rewrite.

---

# HUMAN DECISION GATES

STOP and return a concise decision packet ONLY if one of these occurs.

## Gate A — Multiple credible architectures

Two or more materially different architecture choices remain and repository evidence does not clearly prefer one.

Examples:

```text
new generic relation-support IR vs relation-specific support
taxonomy expansion vs preserving non-admissible semantic object
breaking schema migration vs versioned parallel contract
```

Do not choose arbitrarily.

---

## Gate B — Existing accepted semantics would change

Stop if the next step requires changing semantics of already accepted:

```text
V3.5 production
ExplanatoryRelation kinds
semantic relation IDs
evidence fingerprint rules
CrossClaimProof identity
previously validated V3.6 relations
```

A purely backward-compatible additive extension is not automatically a gate.

---

## Gate C — Safety weakening would be required

Stop rather than:

```text
weakening validator
relaxing cardinality
dropping modality
promoting uncertain/intended/attempted to asserted
inventing destination
using proximity as proof
allowing unresolved participants
```

---

## Gate D — Taxonomy expansion

Stop before adding a new `ExplanatoryRelation` kind.

Return:

```text
existing semantics
why no current kind is lossless
minimal proposed new kind/extension
migration impact
```

---

## Gate E — Live/paid semantic generation becomes necessary

Do not make live provider/LLM calls.

If progress genuinely requires one:

stop and explain:

```text
why deterministic/native/fixture paths are insufficient
exact bounded live experiment proposed
estimated call count
expected information gain
```

---

## Gate F — Repeated failure

If the same semantic/architectural defect fails focused remediation twice:

stop.

Do not enter a prompt-loop or heuristic-loop.

Return root-cause analysis and alternatives.

---

## Gate G — Release/corpus expansion

Before the first broad all-40 semantic migration/admission run that could modify the frozen V3.6 corpus materially:

stop only if migration risk is non-trivial.

A read-only all-40 census is allowed if useful and cheap.

---

# Phase-selection policy

At each checkpoint, select the next task using this priority order:

```text
1. correctness blocker preventing already-proven semantics from flowing downstream
2. missing typed contract at an existing semantic boundary
3. deterministic projection/admission gap with complete upstream semantics
4. native structured-semantic deficiency
5. participant-resolution deficiency
6. cross-claim proof deficiency
7. taxonomy mismatch
8. intentionally non-relational cases
```

Never attack an aggregate gap count without case-level evidence.

---

# No heuristic regression

The entire reason for V3.6 is to stop V3.5-style downstream guessing.

Never implement:

```text
nearby claims imply relation
regex endpoint inference
purpose as destination
chronology as causality
comparison as movement
grouping label as historical evidence
proper-name substring entities
generic verb -> relation inference
```

All semantics must originate in typed upstream objects and pass deterministic validation.

---

# Current expected Phase 2.16

Unless repository evidence contradicts it, Phase 2.16 should prototype the smallest:

```text
proof-aware multi-claim relation-evidence bridge
```

for the single validated Black Death `CrossClaimProofV36`.

The bridge must retain:

```text
proofId
proof pattern
proof validator version

both premise claim IDs
both structured proposition IDs
both atomic grounding IDs

exact source spans/hashes
participant joins
condition -> response direction

conditionAssertionStatus = uncertain
responseAssertionStatus  = attempted
```

It must not merely change the existing validator from:

```text
one proposition
```

to:

```text
one or more propositions
```

Instead provide typed proof evidence proving why the multi-claim support is valid.

---

# Phase 2.16 boundary

Prefer a typed object conceptually like:

```text
RelationProofEvidenceV36
```

or the smallest equivalent compatible with existing architecture.

Required flow:

```text
validated CrossClaimProofV36
        ↓
RelationProofEvidenceV36
        ↓
modality-preserving policy-response representation
        ↓
prototype relation validation
```

Do not yet broaden this to arbitrary relation kinds or proof patterns.

Use only:

```text
Black Death
the existing Phase 2.13 proof
policy-response
```

as the positive case.

---

# When relation admission may occur autonomously

A later phase MAY admit the Black Death policy-response relation without asking the user if ALL are true:

```text
proof contract already accepted
proof validator passes
modality-preserving relation contract already accepted
proof-aware evidence bridge passes
existing/new versioned validator can validate without weakening semantics
semantic ID is deterministic
evidence fingerprint is deterministic
legacy relations remain unchanged
all hard invariants remain zero
same-eight focused gate passes
```

If all are true, admitting this one already-proven relation is mechanical and does not require a human gate.

Commit/tag it as its own phase and continue.

---

# Remaining gap discipline

Current unresolved semantic categories before proof admission are approximately:

```text
2 movement/native-structure gaps
3 assertion/modality blocks
1 taxonomy mismatch
2 intentionally non-relational
1 proof-validated policy-response contract/evidence path
```

Use repository artifacts as authority.

After the proof-backed policy-response path is resolved:

recompute the exact remaining inventory.

Do not assume historical counts remain unchanged.

---

# Movement cases

Never infer:

```text
Franklin:
Northwest Passage = destination
```

when it is an objective.

Never infer:

```text
Spanish Armada:
intended mission route = completed destination
```

If the source/native semantics cannot provide destination:

leave movement relation absent.

These cases may correctly remain unresolved/non-relational.

---

# Assertion/modality cases

Do not force relations from:

```text
uncertain
intended
attempted
```

unless the target relation contract can preserve those exact semantics.

Phase 2.15 proved that relation-specific modality may sometimes be the correct bounded extension.

Apply that lesson cautiously and only with evidence.

---

# Taxonomy mismatch

Do not solve automatically by coercing semantics into the closest relation kind.

If a real taxonomy extension appears necessary:

HUMAN DECISION GATE D.

---

# Intentionally non-relational

Do not treat zero relation output as a defect.

If an atom is correctly:

```text
descriptive
locator-only
objective-only
isolated action
```

it may remain non-relational.

---

# Per-phase workflow

For each autonomous phase:

## A. Preflight

```text
git status
HEAD
latest accepted tag
affected package typecheck
directly relevant focused tests
```

---

## B. Evidence packet

Before implementation, record:

```text
exact target gap/case IDs
source claim/proof IDs
current semantic layer
missing boundary
expected safe outcome
forbidden semantic inference
```

Keep this small.

---

## C. Implement smallest change

One semantic concern per phase.

Avoid combining unrelated gap families.

---

## D. Focused validation

Always run:

```text
affected History typecheck
targeted ESLint
direct tests
45 golden fixtures when relation/semantic contract is touched
same-eight deterministic regression when relevant
```

Do NOT run unrelated full-repository suites.

---

## E. Invariants

Require zeros for all applicable:

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
unresolved participant admission
synthetic grouping as fact
proof from proximity
cross-claim proof without explicit join
legacy relation semantic drift
unexpected relation-ID churn
unexpected evidence-fingerprint churn
V3.5 semantic changes
```

---

## F. Self-review

Before committing, explicitly answer:

```text
Did this phase solve the intended layer?
Did it add inference downstream?
Did it weaken validation?
Did it alter frozen semantics?
Did it accidentally solve unrelated gaps?
Is the next bottleneck now at a different layer?
```

If unsafe:

revert only this phase's changes and stop with a blocker report.

---

## G. Commit + immutable tag

Use one successful commit per semantic phase where practical.

Create an immutable tag:

```text
history-v3.6-<phase-purpose>-baseline
```

Use a versioned suffix if occupied.

Never overwrite a tag.

---

## H. Compact review artifact

Generate:

```text
artifacts/shadow/history-v3.6/
history-v3.6-<phase-purpose>-review-<timestamp>.zip
```

Keep it compact.

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

Add schemas/manual-review only when materially relevant.

Do not produce redundant large packs.

---

# Consolidated run journal

Maintain one append-only run journal:

```text
docs/reports/codex-runs/
2026-08-09-history-v36-autonomous-semantic-drain.md
```

For each phase append only:

```text
phase
starting SHA
target
change
before/after
invariants
commit
tag
artifact
next decision
```

Keep entries concise.

Do not paste large logs.

---

# Final consolidated artifact

At the end of the autonomous run, generate:

```text
history-v3.6-autonomous-semantic-drain-review-<timestamp>.zip
```

Include:

```text
README.md
phase-index.json
remaining-gap-inventory.json
final-relation-summary.json
final-proof-summary.json
final-test-summary.json
final-invariant-summary.json
human-decision-gate.json if stopped on a gate
provenance.json
checksums.sha256
```

Do not duplicate every phase ZIP inside this ZIP.

Reference their paths/checksums instead.

---

# Git safety

Never:

```text
reset --hard across unrelated work
clean untracked user files
force checkout
force tag
rebase published/accepted baselines
rewrite accepted commits
```

Leave unrelated changes untouched.

If another session has modified overlapping files:

detect and stop before overwrite.

---

# Parallelism

Use one primary writer.

Safe read-only/disjoint subagents may inspect:

```text
contract compatibility
validator behavior
fixtures/gap inventory
provenance/determinism
```

Do not allow multiple agents to concurrently edit canonical schemas/validators.

---

# Token discipline

Optimize for low token usage.

Prefer:

```text
rg/find exact modules
small targeted file reads
reuse existing reports/artifacts
bounded fixture inspection
machine-readable summaries
short journal entries
focused tests
```

Avoid:

```text
full repo rereads
full episode prose dumps
repeated architecture explanations
re-running unchanged suites
large duplicate approval packs
```

---

# Provider policy

Hard default:

```text
live provider calls = 0
LLM semantic calls = 0
```

Do not change without HUMAN DECISION GATE E.

---

# V3.5 policy

V3.5 is immutable production reference.

Do not modify:

```text
V3.5 semantics
V3.5 relation behavior
V3.5 plan hashes
V3.5 approval packs
```

unless the user explicitly starts a separate V3.5 task.

---

# Stop conditions after successful progression

Stop and report when ANY is true:

```text
human decision gate reached
6-phase cap reached
no actionable semantic gaps remain
remaining gaps are intentionally non-relational / correctly blocked
next work would be maps/diagrams/compiler implementation
next work would be all-40 release migration with meaningful risk
```

Do not continue into visual/compiler work automatically.

---

# Final response format

Do NOT provide a 50-item report after every phase.

At the end return one compact summary:

```text
AUTONOMOUS RUN: PASS / STOPPED_AT_GATE / PARTIAL

phases completed:
- 2.xx — purpose — commit — tag — result
- ...

net semantic change:
- candidates A -> B
- validated relations A -> B
- remaining gaps A -> B

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

next action:
...

human decision required:
yes/no
reason if yes
```

If stopped at a human gate, provide 2–3 bounded options with a recommended choice.

Do not ask for another prompt merely because one micro-phase completed.

---

# Success criteria

The autonomous run is successful when:

- [ ] every completed phase has a clean focused gate;
- [ ] every completed phase is committed/tagged;
- [ ] every completed phase has a compact artifact;
- [ ] semantic safety invariants remain zero;
- [ ] V3.5 remains unchanged;
- [ ] no live provider/LLM calls occur;
- [ ] no heuristic downstream inference is introduced;
- [ ] no accepted validator is weakened;
- [ ] progression stops at genuine architectural uncertainty rather than arbitrary phase boundaries;
- [ ] the final report is consolidated rather than requiring manual prompt-by-prompt review.

Begin from Phase 2.15 accepted baseline and drain the V3.6 semantic backlog under these rules.
