# History V3.6 — Autonomous Modality Resolution + Semantic Drain

## Goal

Continue the accepted V3.6 semantic architecture autonomously from the latest proof-aware policy-response admission baseline.

The first task is to resolve the remaining **assertion/modality-blocked relation cases** by deciding whether V3.6 should use:

```text
A. relation-kind-specific modality
B. a shared typed relation/premise modality abstraction
C. continued blocking where semantics cannot be represented losslessly
```

After that decision:

- implement the selected design only if repository evidence clearly supports one option;
- validate it on the exact remaining modality-blocked cases;
- continue through subsequent bounded mechanical phases automatically;
- stop only at a genuine human-decision gate or the run cap.

Do not stop after every successful micro-phase merely to request another prompt.

---

# Starting baseline

Latest accepted autonomous run:

```text
FINAL_HEAD:
20a1a44186d885f7566d301edadbe9401d1e3485

TAG:
history-v3.6-proof-aware-policy-response-admission-baseline
```

Prior accepted modality/proof baselines include:

```text
Phase 2.15:
900be4197a81c976e85737fe49088538a3d60a15
history-v3.6-policy-response-modality-contract-baseline-v2

Phase 2.14:
e1525f732ecd3776304c38b3bf18eb761e065714

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

Never overwrite accepted tags.

---

# Current accepted semantic state

The prior autonomous run successfully completed the proof-aware Black Death path:

```text
CrossClaimProofV36
        ↓
proof-aware multi-claim relation evidence
        ↓
modality-preserving policy-response relation
```

Net state after that run:

```text
relation candidates:   52 -> 53
validated relations:   30 -> 31
remaining gaps:         9 -> 8
```

Remaining categories reported:

```text
NEEDS_ADDITIONAL_NATIVE_STRUCTURE   2
ASSERTION_OR_MODALITY_BLOCK         3
TAXONOMY_MISMATCH                   1
INTENTIONALLY_NON_RELATIONAL        2
```

Treat repository artifacts as authority and reconcile these counts before work.

---

# Autonomous run cap

Complete at most:

```text
5 new phases
```

starting with the next sequential phase after the latest accepted run.

Do not skip phase numbers.

Stop sooner at a HUMAN DECISION GATE.

---

# Phase 0 — Mandatory preflight

Run:

```bash
git status --short
git branch --show-current
git rev-parse HEAD
git log --oneline --decorate -25

git rev-parse history-v3.6-proof-aware-policy-response-admission-baseline
git rev-parse 'history-v3.6-proof-aware-policy-response-admission-baseline^{}'

git rev-parse history-v3.6-policy-response-modality-contract-baseline-v2
git rev-parse 'history-v3.6-policy-response-modality-contract-baseline-v2^{}'

git rev-parse history-v3.5-frozen-before-v36
git rev-parse 'history-v3.5-frozen-before-v36^{}'
```

Verify the current branch descends cleanly from the accepted baseline.

Run focused preflight:

```text
History package typecheck
latest proof-aware admission tests
policy-response modality contract tests
45 golden semantic fixtures
same-eight focused regression if cheap/current
```

Proceed only if green.

Create immutable checkpoint:

```text
history-v3.6-pre-modality-resolution-drain
```

Use a versioned equivalent if occupied.

No destructive Git operations.

Leave unrelated worktree changes untouched.

---

# First phase — Exact modality-gap inventory

Load the exact three remaining gaps currently classified:

```text
ASSERTION_OR_MODALITY_BLOCK
```

Do not infer them from memory.

For each record:

```text
gapId
episodeId
claimId
structured proposition ID
atomic grounding ID
current atomic predicate
current relation family expected, if any
assertion/modality status
participants
direction/order
source span/hash
why current relation admission is blocked
```

There must be exactly three.

If the repository does not reconcile to three:

STOP and report the mismatch.

---

# Required modality architecture decision

Compare exactly:

```text
OPTION_A_RELATION_KIND_SPECIFIC_MODALITY

OPTION_B_SHARED_TYPED_RELATION_MODALITY

OPTION_C_KEEP_BLOCKED
```

Do not invent a fourth option unless all three fail for a documented reason.

---

## Option A — relation-kind-specific modality

Each relation kind that genuinely requires non-default modality gets the minimum fields it needs.

Examples conceptually:

```text
movement:
  movementAssertionStatus

causal:
  cause/effect or relation assertion status

policy-response:
  conditionAssertionStatus
  responseAssertionStatus
```

Evaluate:

```text
semantic fidelity
minimality
backward compatibility
relation-ID impact
validator impact
migration scope
risk of duplicated semantics
```

Policy-response already provides evidence that relation-specific modality can be appropriate.

---

## Option B — shared typed relation/premise modality

Introduce a reusable typed structure only if the three remaining cases genuinely share the same semantic model.

Possible conceptual shape:

```text
relation assertion metadata

or

directed premise {
  participant
  assertionStatus
}
```

Do NOT generalize all relation kinds automatically.

Evaluate:

```text
true semantic reuse
contract complexity
migration impact
identity rules
validator complexity
risk of premature abstraction
```

A shared type should win only if repository evidence shows real common semantics rather than superficial field reuse.

---

## Option C — keep blocked

Leave one or more relations unavailable when no lossless representation exists.

This is valid.

Do not treat relation-count growth as mandatory.

---

# Decision rule

Select a design only when repository evidence clearly prefers one.

Use these priorities:

```text
1. semantic fidelity
2. backward compatibility
3. smallest evidenced semantic surface
4. deterministic identity
5. validator strictness
6. migration safety
7. implementation simplicity
```

If A vs B remains materially ambiguous:

HUMAN DECISION GATE.

Do not choose arbitrarily.

---

# Identity principle

Modality is semantic when changing it changes what the relation asserts.

Therefore, for non-default modality:

```text
semantic relation identity should normally differ
```

unless the existing accepted relation-specific contract proves otherwise.

Legacy/default asserted semantics should preserve existing IDs.

Do not introduce unrelated relation-ID churn.

---

# Missing-modality semantics

For any extended relation kind:

```text
missing modality
```

must have one explicit deterministic interpretation.

If repository evidence shows historical semantics were:

```text
asserted
```

then document/test:

```text
missing => asserted
```

Do not invent defaults without evidence.

If historical semantics are ambiguous:

block that extension.

---

# Validator policy

No weakening.

Allowed validator changes are only stricter typed awareness of newly explicit modality.

Never:

```text
promote intended -> asserted
promote attempted -> completed
promote uncertain -> certain/asserted
ignore asymmetric premise status
```

---

# Mechanical implementation policy

If one option wins clearly:

1. prototype selected schema;
2. run compatibility tests;
3. preserve legacy IDs/fingerprints;
4. validate exact three blocked cases;
5. commit/tag the contract phase;
6. continue automatically into direct candidate/admission projection only for cases that become losslessly representable.

If one or more cases still cannot be represented losslessly:

leave them blocked.

---

# Candidate/admission implementation

After the modality contract is accepted in-run, a later mechanical phase MAY admit a previously blocked relation if all are true:

```text
upstream semantics complete
modality preserved exactly
participants resolved
direction/cardinality explicit
existing relation taxonomy fits
semantic identity deterministic
evidence fingerprint deterministic
validator passes without weakening
all safety invariants zero
```

No human stop is required for a purely mechanical admission under an already-selected contract.

---

# The two additional-native-structure gaps

These remain separate.

Do not solve them merely because you are editing movement modality.

Known safety controls remain:

```text
Franklin search objective != destination

Spanish Armada intended mission route != completed destination
```

If these two cases still lack actual destination semantics:

leave them unresolved.

Do not invent destinations.

After modality work is complete, reassess them only if repository evidence shows genuinely new source-supported native structure is available.

---

# Taxonomy mismatch

The one:

```text
TAXONOMY_MISMATCH
```

case is a HARD HUMAN GATE.

Do not add or modify relation taxonomy automatically.

When reached, stop and return:

```text
exact gap ID
source claim
current structured/atomic semantics
why all existing relation kinds are lossy
2-3 bounded taxonomy options
recommended option
compatibility/migration impact
```

Do not implement the new taxonomy before human approval.

---

# Intentionally non-relational cases

The two:

```text
INTENTIONALLY_NON_RELATIONAL
```

items are not implementation backlog.

Freeze them unless repository semantics have materially changed.

Do not force relation output.

They may count as:

```text
correctly terminal
```

rather than unresolved defects.

---

# Human decision gates

STOP only when one occurs.

## Gate A — architecture ambiguity

Two materially different modality architectures remain credible after evidence review.

## Gate B — accepted semantic change

Progress requires changing already accepted relation semantics, IDs, proof semantics, or evidence identity.

## Gate C — validator weakening

Any progress would require semantic weakening.

## Gate D — taxonomy expansion

New relation kind or semantic family required.

## Gate E — live semantic generation

A provider/LLM call becomes necessary.

## Gate F — repeated failure

Same semantic defect fails two focused attempts.

## Gate G — risky release migration

Broad corpus migration becomes the next step and carries material semantic churn risk.

---

# No heuristic regression

Never implement:

```text
purpose as destination
intent as completion
chronology as causality
comparison as movement
claim proximity as proof
generic verb -> relation mapping
synthetic grouping labels as historical fact
proper-name substring entities
```

Typed upstream semantics remain authoritative.

---

# Per-phase workflow

For each autonomous phase:

## 1. Evidence packet

Record only:

```text
target gaps/cases
current layer
missing semantic capability
accepted upstream evidence
forbidden inference
expected safe outcome
```

## 2. Smallest implementation

One semantic concern per phase.

## 3. Focused validation

Run:

```text
affected History typecheck
targeted ESLint
direct tests
45 goldens if relation/schema semantics touched
same-eight deterministic regression when relevant
```

No unrelated full-repo suite.

## 4. Hard invariant gate

Require all applicable counts zero:

```text
unsupported validated relation
duplicate semantic ID
cross-episode support
directionality violation
cardinality violation
proper-name fragmentation
purpose-as-destination
chronology-to-causality
process-to-causality
modality loss
modality strengthening
wrong-premise modality
unresolved participant admission
legacy relation semantic drift
unexpected relation-ID churn
unexpected evidence-fingerprint churn
V3.5 semantic change
```

## 5. Self-review

Answer:

```text
Did this solve the intended layer?
Did it introduce downstream inference?
Did validator strictness change?
Did legacy semantics drift?
Did unrelated gaps change?
```

## 6. Commit + tag

One successful semantic phase per commit where practical.

Tag:

```text
history-v3.6-<purpose>-baseline
```

Version suffix if occupied.

Never overwrite tags.

## 7. Compact artifact

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

Only include schema/manual-review when relevant.

## 8. Continue

Derive the next smallest evidence-backed phase and continue automatically unless at a human gate.

---

# Consolidated journal

Append to:

```text
docs/reports/codex-runs/
2026-08-09-history-v36-autonomous-modality-drain.md
```

Each phase entry should be concise:

```text
phase
start SHA
target
decision/change
before/after
invariants
commit
tag
artifact
next
```

No large logs.

---

# Consolidated final artifact

Generate:

```text
history-v3.6-autonomous-modality-drain-review-<timestamp>.zip
```

Include:

```text
README.md
phase-index.json
modality-decision-summary.json
remaining-gap-inventory.json
final-relation-summary.json
final-test-summary.json
final-invariant-summary.json
human-decision-gate.json if applicable
provenance.json
checksums.sha256
```

Reference per-phase artifacts rather than embedding them.

---

# Parallelism

Use one primary writer.

Read-only/disjoint subagents may inspect:

```text
existing modality semantics
legacy relation ID compatibility
validator behavior
remaining gap evidence
```

Do not allow concurrent editing of canonical schemas/validators.

---

# Token discipline

Prefer:

```text
exact rg/find
small targeted reads
existing artifacts
bounded gap inspection
machine-readable summaries
focused tests
```

Avoid:

```text
full repo rereads
full episode dumps
repeated architecture explanations
large duplicate artifacts
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

V3.5 is frozen.

No changes to:

```text
claims
planning
relations
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
all actionable non-taxonomy semantic gaps resolved
remaining items are terminal/non-relational
next step is taxonomy expansion
next step is risky all-40 migration
next step is visual/compiler work
```

---

# Final response format

Return one compact final summary:

```text
AUTONOMOUS MODALITY RUN:
PASS / STOPPED_AT_GATE / PARTIAL

phases completed:
- phase — purpose — commit — tag — result

modality architecture:
selected option
why

net semantic change:
candidates A -> B
validated relations A -> B
remaining actionable gaps A -> B

terminal non-relational items:
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
exact gate + 2-3 options + recommended choice
```

Do not stop after a successful phase merely to request another prompt.

Begin from the accepted `history-v3.6-proof-aware-policy-response-admission-baseline`.
