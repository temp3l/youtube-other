# Phase Goal — Baseline, Contracts, and Approval Policy

## Context

This phase is part of the History Approval Packs V3.2 remediation. Read first:

- `01-history-v3.2-master-goal.md`
- `references/history-approval-packs-v3.1-review-report.md`
- applicable `AGENTS.md` files
- current V3.2 plan/status/decision artifacts, if present

## Objective

Establish a reproducible repository baseline and implement the versioned V3.2 contracts and approval-state architecture needed by later phases.

Do not regenerate episode bundles in this phase.

## Required work

### Repository discovery

Map and document:

- History schemas and generated TypeScript types;
- planner versions and factories;
- narration normalization/timing code;
- claim extraction and source models;
- map/diagram generation and validators;
- visual-purpose, shot, and ratio adaptation generation;
- artifact lint, semantic validation, manifests, approval gates;
- CLI commands and pack exporters;
- target episode fixtures and canonical inputs;
- relevant shared-package dependencies;
- current test and build commands.

Update `PLAN.md` with an affected-file map and milestone validation commands.

### Regression baseline

Investigate the reported Math Education characterization failure.

Record:

- current commit SHA;
- baseline/reference commit SHA;
- exact command and test name;
- output before and after V3/V3.1 where reproducible;
- whether History code can reach the failing behavior;
- conclusion: introduced regression, pre-existing failure, or unresolved.

Fix an introduced regression. If pre-existing, create a durable baseline artifact/test note with evidence. Do not merely label it unrelated.

Add or identify characterization coverage for Dark Truth/horror, Math Education, Veronica Benini, and other consumers of touched shared contracts.

### V3.2 contracts

Implement versioned, serializable, schema-validated contracts for:

- timing source and timing breakdown;
- separate structural/editorial/content/production approval states;
- claim materiality;
- source registry and locators;
- claim-source links and support type;
- deterministic provenance status;
- human provenance overrides with reviewer/timestamp/reason/hashes;
- per-node/per-edge diagram support;
- typed map participant roles;
- structured visual purpose;
- explicit shot treatment;
- ratio-specific composition contract;
- grouped diagnostic counts;
- canonical and normalized narration hashes plus algorithm version.

Preserve compatibility with V1, V2, V3, and V3.1 readers/artifacts.

### Approval policy

Implement or formalize policy so that:

- structural validity alone never implies approval;
- unresolved material claims block content approval;
- measured immutable audio is required for production approval;
- provisional timing can remain editorially reviewable;
- human overrides are explicit and hash-bound;
- no model-generated status can bypass deterministic policy.

## Tests

Add focused tests for:

- schema round trips;
- backward-compatible readers;
- impossible/invalid approval-state combinations;
- unresolved material claim gating;
- audited override requirements;
- false-green status prevention;
- non-History characterization where shared contracts change.

## Completion gate

Complete this phase only when:

- baseline evidence is recorded;
- V3.2 contracts compile and serialize deterministically;
- compatibility tests pass;
- approval-policy tests pass;
- affected non-History characterization tests pass or have reproducible pre-existing baseline evidence;
- `STATUS.md`, `DECISIONS.md`, and `VERIFICATION.md` are updated.

Report exact commands and results. Do not proceed to regeneration.
