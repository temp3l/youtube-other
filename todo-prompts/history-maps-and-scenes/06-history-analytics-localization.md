# Codex Goal 6 — History Analytics Feedback Loop and Multilingual Rollout

## Preconditions

Stable episode IDs, publication metadata, packaging candidate IDs, and final YouTube video IDs must exist.

## Objective

Implement a measurable post-publication learning loop and guarded multilingual expansion. Collect real analytics, diagnose likely weaknesses, propose versioned improvements, and require approval before changing history defaults.

## Repository and isolation rules

Inspect the repository first and reuse existing YouTube analytics, scheduling, workflow, persistence, localization, TTS, CLI, and reporting abstractions. Do not build a parallel pipeline.

Keep behavior history-specific. Shared changes must be additive, opt-in, backward compatible, and enabled only by the history profile. Preserve all non-history behavior and artifacts. Add characterization tests before changing analytics contracts, scheduler behavior, profile defaults, workflow state, or file paths.

Use strict TypeScript, schema validation, idempotent collection, explicit data availability, versioned configuration, and production logging without secrets.

## Performance snapshots

Create configurable checkpoints, defaulting to approximately 48 hours, 7 days, and 28 days.

Reuse existing YouTube Analytics/API integrations. Otherwise implement provider interfaces, fixtures, and manual import.

Collect only available real metrics:

- impressions, CTR, views, watch time;
- average view duration and percentage viewed;
- first-30-second retention and retention curve;
- top moments, spikes, and dips;
- subscribers gained;
- traffic sources;
- end-screen/card/playlist continuation;
- title/thumbnail experiment results;
- permitted audience geography/language data.

Never fabricate unavailable metrics.

## Typed model

Add validated models equivalent to:

```ts
interface HistoryVideoPerformanceSnapshot {
  episodeId: string;
  videoId: string;
  checkpoint: "H48" | "D7" | "D28" | string;
  observedAt: string;
  impressions?: number;
  clickThroughRate?: number;
  views?: number;
  watchTimeSeconds?: number;
  averageViewDurationSeconds?: number;
  averagePercentageViewed?: number;
  firstThirtySecondsRetention?: number;
  subscribersGained?: number;
  retentionMoments: HistoryRetentionMoment[];
  trafficSources: HistoryTrafficSource[];
  packagingExperiment?: HistoryPackagingExperimentResult;
  dataAvailability: HistoryMetricAvailability[];
}
```

Use repository conventions rather than forcing this exact interface.

## Diagnostic engine

Implement evidence-based rules such as:

- low impressions: topic/channel positioning may be weak;
- impressions plus low CTR: packaging likely weak;
- high CTR plus early drop: promise/opening mismatch;
- drop during background exposition: restructure or improve explanatory visuals;
- spikes on maps/diagrams: increase useful geographic/explanatory media;
- strong retention plus weak continuation: improve series routing;
- views without subscriptions: channel promise or CTA may be unclear.

Every diagnosis must cite metrics/timestamps, state confidence, distinguish correlation from causation, enforce minimum sample sizes, compare with channel/series baselines when available, and avoid global conclusions from one video.

## Learning proposals

Generate proposals instead of silently mutating defaults. Support changes to topic scoring, packaging heuristics, hooks, pacing, visual mix, map/diagram thresholds, length, and series routing.

Each proposal needs evidence, expected impact, risk, scope, approval status, rollback plan, and config version. Only approved proposals affect future videos. Persist the profile/config version used by each episode.

## Reports

Produce concise 48-hour, 7-day, and 28-day reports, dashboard data, experiment summaries, prioritized actions, and insufficient-data warnings.

## Multilingual rollout gate

Do not automatically localize weak or unproven videos.

Determine eligibility from statistical reliability, retention, evergreen/international relevance, target-language demand, cost, rights compatibility, competition, and operator approval.

For eligible episodes produce:

- prioritized target languages;
- translated title, description, and chapters;
- localized thumbnail specifications;
- dubbing/TTS plan through existing provider abstractions;
- pronunciation/localization QA;
- multi-audio-track strategy when supported;
- cost estimate and approval pack.

Preserve uncertainty, sources, provenance, and disclosure across languages.

## CLI/workflow

Add commands equivalent to:

```bash
youtube history analytics collect --episode <id> --checkpoint H48
youtube history analytics analyze --episode <id>
youtube history learning propose
youtube history learning approve --proposal <id>
youtube history localization plan --episode <id>
```

Reuse an existing scheduler if present. Otherwise emit explicit due dates and commands rather than creating another scheduler.

## Artifacts

Produce equivalents of:

- `history-performance-h48.json`
- `history-performance-d7.json`
- `history-performance-d28.json`
- `history-performance-analysis.json`
- `history-learning-proposals.json`
- `history-profile-version.json`
- `history-localization-eligibility.json`
- `history-localization-plan.json`

## Tests

Cover missing metrics, sample thresholds, diagnosis rules, baseline comparison, proposal approval/versioning/rollback, no silent mutation, idempotent checkpoints, localization eligibility, uncertainty-preserving translation, and non-history regressions.

Use synthetic fixtures for low CTR, early drop, exposition drop, map spike, and strong retention with weak continuation.

## Completion report

Return only architecture reused, files changed, commands, tests/results, example diagnostic/proposal/localization artifacts, assumptions/blockers, and recommended operating cadence.
