# Task: Cost Controls, Fingerprints, And Telemetry

Add centralized cost controls and observability for full and short variants.

## Required Reporting

Telemetry and costs must distinguish:

- `en/full`, `en/short`
- `es/full`, `es/short`
- `de/full`, `de/short`
- `pt/full`, `pt/short`
- `fr/full`, `fr/short` where supported

Report at least:

- full generation cost;
- full localization cost;
- short generation cost;
- localized short generation cost;
- full repair cost;
- short repair cost;
- metadata by variant;
- audio by variant;
- failed calls by variant;
- token exhaustion by variant;
- cost per final full video;
- cost per final short video;
- combined cost per episode and locale.

## Fingerprints

Request fingerprints must include:

- language;
- locale;
- variant;
- parent artifact hash;
- task;
- model;
- reasoning effort;
- output cap;
- compiler version;
- schema version;
- short-contract version where relevant.

## Tests

Add tests for:

- fingerprint changes on variant or parent hash;
- duplicate failed request suppression;
- cost ceiling blocks provider call;
- failed calls count cost;
- summary groups by locale and variant.

## Acceptance Criteria

- Cost ceilings are variant-aware.
- Telemetry can answer cost per full video, short video, and episode/locale.
- Fingerprints prevent unchanged expensive retries.
