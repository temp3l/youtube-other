# Task: Canonical English Full Generation

Refactor canonical English full generation as its own validated artifact.

## Objective

Ensure canonical English full narration is generated from cleaned English source, StoryIR, full-story contract, full compiler, and full schema only.

## Flow

```text
raw English source
  -> cleaned English source
  -> StoryIR
  -> full-story contract
  -> full prompt compilation
  -> token/cost preflight
  -> canonical English full narration generation
  -> deterministic full validation
  -> optional semantic full validation
  -> full repair or controlled full regeneration
  -> validated canonical English full narration
```

## Requirements

- `stories rewrite-full` must preserve its public behavior.
- Canonical English full must not request or return short, metadata, audio, scene, image, render, thumbnail, or publication content.
- Full output must include parent source hashes, StoryIR hash, full contract hash, compiler version, prompt hash, model config, token usage, cost, validation, repair history, and status.
- Canonical English full changes invalidate all localized full stories and all short stories.

## Tests

Add tests for:

- full-only schema selection;
- generated artifact lineage;
- validation blocks missing climax or ending;
- no short model route;
- resume rejects stale canonical full.

## Acceptance Criteria

- Canonical English full is a first-class artifact.
- It never enters short model routes, short schemas, or fragment-repair budgets.
- Downstream stages depend on validated canonical English full only.
