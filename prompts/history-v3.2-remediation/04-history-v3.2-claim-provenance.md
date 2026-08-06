# Phase Goal — Claim-Level Historical Provenance

## Context

Read:

- `01-history-v3.2-master-goal.md`
- `references/history-approval-packs-v3.1-review-report.md`
- current V3.2 plan/status/decision artifacts
- completed V3.2 contracts and approval policy

V3.1 contains candidate episode sources but 408 of 408 extracted claims have no claim-level source links and remain unresolved.

## Objective

Implement an auditable provenance pipeline that attaches validated evidence to material claims and blocks approval when material provenance is unresolved.

## Non-negotiable policy

OpenAI or another LLM may:

- classify claim materiality as a candidate;
- rank known source references;
- identify candidate evidence passages;
- propose support relationships;
- help detect conflict or ambiguity.

It may not:

- invent a source or locator;
- select an ID outside the supplied source registry;
- mark a claim authoritatively supported;
- set approval eligibility;
- replace deterministic validation or human review.

Compute authoritative `sourceStatus` from validated links, locators, evidence, and overrides.

## Required pipeline

### Source registry

Represent and validate, where available:

- stable source ID;
- title;
- author;
- publisher/institution;
- URL or identifier;
- publication/access date;
- source type;
- content snapshot/hash;
- edition/version.

Do not require unavailable metadata merely to create false completeness, but report missing audit fields.

### Locators and evidence

Support source-appropriate locators such as:

- page;
- section/chapter;
- paragraph/fragment;
- timestamp;
- stable document anchor.

Persist enough information for an independent reviewer to locate the evidence. Hash normalized evidence text or source snapshots where practical.

### Claim materiality

Classify and validate at least:

- material factual;
- chronology/date;
- quantity/statistic;
- causality/mechanism;
- disputed interpretation;
- geography/movement;
- map-driving;
- diagram-driving;
- quotation;
- non-material connective/editorial language.

Materiality must be conservative for claims that drive generated factual visuals.

### Claim-source links

Each link must include:

- claim ID;
- source ID;
- locator;
- support type;
- candidate/verified state;
- method that produced it;
- verification evidence;
- confidence as advisory metadata only.

Reject dangling IDs, empty required locators, unresolvable evidence, and generated quotations that do not match source content.

### Status derivation

Derive statuses such as:

- unresolved;
- candidate;
- supported;
- disputed;
- overridden.

Define deterministic rules and test them. A high model confidence score is not sufficient for `supported`.

### Approval gate

Every material claim used by a map, diagram, quotation, quantitative graphic, or factual visual must be supported or explicitly overridden.

Unresolved or merely candidate material claims block content approval.

### Human override

Require:

- reviewer identity;
- timestamp;
- reason;
- decision;
- prior source status;
- narration hash;
- plan hash.

Overrides must be visible in manifests and review exports.

## Research for the three target episodes

Use existing declared candidate sources and repository research artifacts first.

When network access and project policy permit external research:

- prefer primary sources, scholarly publications, museum/archive/university resources, and reputable historical reference works;
- capture stable metadata and evidence locators;
- distinguish direct evidence from historical interpretation;
- preserve disagreement rather than flattening it;
- do not silently rewrite narration to match weak sources.

When evidence does not support a material claim, choose one of:

1. revise the claim/narration with explicit hash/version change;
2. mark it disputed/uncertain visibly;
3. remove the unsupported visual implication;
4. leave the claim blocking;
5. use a documented human override.

Never fabricate a link to achieve eligibility.

## Required tests

1. Invalid/dangling source IDs are rejected.
2. Invalid or absent required locators are rejected.
3. Candidate links do not produce supported status.
4. Verified direct/strong-entailment links produce supported status according to policy.
5. Contextual-only links are insufficient for material claims unless policy explicitly permits it.
6. Contradicting sources produce disputed status.
7. Unresolved material claims block content approval.
8. Non-material unresolved text is reported without necessarily blocking.
9. Model output cannot set authoritative status.
10. Override audit fields and plan/narration hash binding are mandatory.
11. Changes to narration invalidate stale provenance/overrides.
12. Per-episode provenance counts are deterministic and surfaced in manifests.

## Completion gate

Complete only when:

- provenance machinery and tests pass;
- the three episodes have real claim-level links for material visual-driving claims or remain explicitly blocked;
- no invented sources/locators exist;
- status derivation is deterministic;
- approval policy cannot become eligible through duration correction alone;
- all decisions and unresolved evidence gaps are documented.
