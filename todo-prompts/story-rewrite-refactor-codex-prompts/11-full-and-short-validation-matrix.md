# Task: Full And Short Validation Matrix

Implement variant-aware deterministic validation and optional semantic validation.

## Full Validation

Full-story validation must cover:

- target full word range;
- duration estimate;
- chronology;
- required entities;
- immutable facts;
- climax;
- ending;
- genre policy;
- narration-only output;
- language and locale consistency;
- no truncation;
- no duplicated major sections;
- no metadata/audio/visual leakage.

## Short Validation

Short-story validation must cover:

- target short word range and duration;
- hook within configured opening window;
- immediate story identification;
- one coherent narrative thread;
- central threat or mystery;
- central rule or mechanism when relevant;
- no unsupported facts;
- no contradiction with parent full story;
- climax or irreversible turn retained;
- final consequence or sting retained;
- no unresolved pronouns caused by compression;
- no orphaned references;
- no metadata/audio/visual leakage;
- no generic synopsis language;
- no structural commentary;
- correct language and locale;
- no truncation.

## Required Short Issue Codes

Include repository-named equivalents of:

- `SHORT_SOURCE_NOT_VALIDATED_FULL`
- `SHORT_PARENT_HASH_MISMATCH`
- `SHORT_WORD_RANGE_INVALID`
- `SHORT_DURATION_OUT_OF_RANGE`
- `SHORT_HOOK_TOO_LATE`
- `SHORT_MISSING_CENTRAL_THREAT`
- `SHORT_MISSING_CENTRAL_RULE`
- `SHORT_MISSING_CLIMAX`
- `SHORT_MISSING_FINAL_CONSEQUENCE`
- `SHORT_CONTRADICTS_FULL_STORY`
- `SHORT_ORPHANED_REFERENCE`
- `SHORT_READS_AS_SYNOPSIS`
- `FULL_STORY_ROUTED_TO_SHORT_GENERATOR`
- `SHORT_STORY_ROUTED_TO_FULL_REGENERATION`

## Tests

Add matrix tests for full and short variants across `en`, `es`, `de`, `pt`, and `fr` where supported.

## Acceptance Criteria

- Validators are variant-aware and testable.
- Short validation checks parent lineage and content compression defects.
- Full validation never applies short hook or beat rules.
