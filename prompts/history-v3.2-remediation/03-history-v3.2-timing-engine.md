# Phase Goal — Narration Timing Truthfulness

## Context

Read:

- `01-history-v3.2-master-goal.md`
- `references/history-approval-packs-v3.1-review-report.md`
- current V3.2 plan/status/decision artifacts
- completed V3.2 contracts

The V3.1 planner reports implausible durations because sentence segmentation appears to accumulate minimum duration or pause costs.

## Objective

Implement a deterministic total-duration timing engine whose output is stable across sentence segmentation and whose approval policy distinguishes provisional estimates from measured audio.

Do not regenerate final approval ZIPs in this phase.

## Required behavior

### Total-duration calculation

Derive provisional duration from:

1. normalized spoken word/token count;
2. configured narration WPM;
3. bounded punctuation pauses;
4. bounded paragraph/chapter pauses.

Do not add an unconditional minimum duration for every narration sentence.

If narration units require minimum timeline slices, allocate and rebalance them so their sum exactly equals the already-computed total duration.

### Normalization

Use the same production-relevant normalization for timing that the TTS path uses where appropriate, including number/abbreviation verbalization. Avoid double-normalization or genre drift.

Shared normalizer changes must remain backwards compatible and characterized across genres.

### Timing source

Support at least:

- provisional word estimate;
- measured immutable TTS/audio duration.

Measured audio supersedes estimates for production approval and must be bound to an immutable asset/hash where the repository architecture supports it.

### Tolerances

Add configurable absolute and relative timing thresholds with distinct warning and blocker levels.

A small estimated discrepancy can be a warning. Large V3.1 discrepancies must remain blocking. Do not hard-code episode-specific exceptions.

### Timeline invariants

Preserve:

- complete narration-unit coverage;
- contiguous non-overlapping beat and shot timelines;
- exact final end time equal to planned narration duration;
- deterministic allocation and rounding;
- compatibility with required ratio plans.

## Required tests

1. Same narration split into 20 versus approximately 180 units produces near-identical total duration.
2. Punctuation-heavy versus punctuation-light text respects bounded overhead.
3. Chapter pauses are bounded and configurable.
4. Allocation sums exactly to total duration with deterministic rounding.
5. Empty/very short narration is handled safely.
6. Number and abbreviation normalization is reflected once.
7. Small delta is warning; large delta is blocker.
8. Measured audio supersedes estimate.
9. Production approval cannot be true with provisional timing alone.
10. Regression fixtures for Napoleon, Fall of Rome, and Black Death produce plausible estimates near the configured 108 WPM policy.

## Episode expectations

Do not force exact values, but verify that:

- Napoleon no longer inflates from roughly 10 minutes by several minutes solely due to segmentation;
- Fall of Rome no longer inflates to roughly 17 minutes from 1,149 words;
- Black Death’s small difference is classified according to configured tolerance rather than an unconditional blocker.

## Completion gate

Complete this phase only when:

- timing and allocation tests pass;
- all three target scripts produce explainable timing breakdowns;
- approval states correctly reflect provisional versus measured timing;
- no unrelated genre timing behavior changes without explicit opt-in and characterization;
- verification evidence is recorded.

Do not package or claim final production approval yet.
