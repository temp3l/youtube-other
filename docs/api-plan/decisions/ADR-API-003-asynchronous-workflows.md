# ADR-API-003: Asynchronous Workflows

- **Status:** Board accepted
- **Date:** 2026-07-31
- **Confidence:** High

## Question

How are long-running operations exposed?

## Repository evidence

Generation, batch providers, TTS, rendering, and publishing have retries, external cost, long duration, partial outcomes, and resume requirements.

## Options

Synchronous requests are simple but unreliable; asynchronous jobs with polling are smallest reliable; webhooks add integration value; SSE adds interactive convenience.

## Impacts

Async jobs isolate credentials/workers, support cancellation/retry, and make operations observable. They require durable job state and client polling.

## Recommendation

Return `202`, job/run IDs, polling, named phase/count progress, approval wait, retry scheduling, cancellation, partial success, dead letter, cache-hit evidence, and resume. Add signed webhooks for pilot; defer SSE.

## Conditions that change it

Only proven sub-second deterministic reads should remain synchronous. SSE may be added after demand and replay/capacity design.

## Consequences

No HTTP request handler performs provider, render, or publication work.
