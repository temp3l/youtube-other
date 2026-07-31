# Task 10: Worker Reliability And Cancellation

## Objective

Make asynchronous provider and FFmpeg work safe under crashes, retries, timeouts, and cancellation.

## Scope

- propagate lease fences, deadlines, abort signals, and scoped execution context through every task adapter
- implement queued, running, cancelling, cancelled, interrupted, uncertain, and terminal transition guards
- implement FFmpeg/process TERM grace followed by bounded KILL escalation
- quarantine partial outputs and reject late completion after cancellation or lease loss
- stop new provider dispatch when durable state cannot be checked

## Tests And Verification

Add worker-kill, live-heartbeat, reclaim, cancellation, late-output, provider-timeout, and database-loss tests using controlled process/provider fakes.

## Acceptance Criteria

A live task is not double-claimed, a cancelled render cannot register a ready asset, and unsafe external effects move to uncertainty/reconciliation rather than automatic retry.
