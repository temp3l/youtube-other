# Acceptance Criteria

## Domain

- `it` is a supported locale everywhere that existing locales are supported.
- `strategic-reinvention` is loaded through a generic genre registry.
- `veronica-benini` is loaded through a creator-profile registry.
- genre and creator profile are validated at runtime and typed at compile time.
- no creator-specific logic is hard-coded into generic rendering packages.

## Source provenance

- every episode has one or more source manifests;
- every narrative beat references source IDs;
- source hash changes invalidate downstream outputs;
- unclear rights block adaptation and publication;
- premium/private sources cannot produce public output without a specific grant;
- sensitive and high-risk sources produce a visible blocking status.

## Authorship

- first-person lines must trace to creator source text;
- unsupported first-person output fails validation;
- generated opinions are disabled for the supplied profile;
- the stage outputs an unsupported-inference report;
- scripts preserve approved colloquial vocabulary without blind imitation.

## Localization

- Italian is canonical for the supplied creator profile;
- all localizations derive from the approved Italian script;
- protected terms are reported;
- locale-specific approval is required;
- metadata and CTA destinations are localized;
- language-specific paths use `createEpisodePathResolver`.

## Rendering

- 16:9 and 9:16 have independent composition plans;
- visual planner supports typography, diagrams, timelines, B-roll and creator media;
- no synthetic likeness is generated when disabled;
- audio stems, subtitles and metadata are packaged per locale;
- render manifests contain input and output fingerprints.

## Approval

- uploader rejects missing or stale publish approval;
- upstream source changes revoke downstream approval;
- approval records contain approver, timestamp and fingerprints;
- high-risk content requires a second reviewer;
- all approval CLI commands emit audit events;
- auto-publish remains false.

## Reliability

- interrupted stages resume without duplicating completed work;
- retries do not produce duplicate uploads;
- concurrency is bounded;
- all external calls have timeout and retry policy;
- secrets and bearer tokens are redacted from logs;
- unsafe filenames are normalized;
- stale CLI distribution is detected by `doctor`;
- tests run without paid external services.

## Testing

Minimum tests:

- locale exhaustiveness;
- path resolver fixtures;
- genre/profile parsing;
- source rights matrix;
- premium leakage;
- unsupported first-person inference;
- approval invalidation;
- sensitive-source block;
- full/short paths;
- localization provenance;
- multi-language packaging;
- uploader publish gate;
- duplicate upload protection;
- resume after partial completion;
- redacted telemetry snapshot.

## Documentation

- architecture decision records;
- operator runbook;
- source onboarding guide;
- creator onboarding guide;
- migration notes;
- end-to-end dry-run example;
- known limitations and remaining decisions.
