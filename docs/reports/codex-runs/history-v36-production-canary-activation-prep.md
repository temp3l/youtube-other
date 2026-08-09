# History V3.6 production-canary activation-prep journal

## Phase 0

- starting SHA: `cbeab20078c3932e1e08cdb9e607fde34a96c9e4`
- goal: verify readiness baseline and canary prerequisites
- result: baseline descends cleanly; History typecheck, targeted ESLint, and 18 renderer/compiler/plan tests passed
- tests: preflight checkpoint tag `history-v3.6-pre-production-canary`
- invariants: V3.5 default and production isolation intact
- commit/tag: baseline / `history-v3.6-pre-production-canary`
- next: exact canary-only route

## Phase 1

- starting SHA: `cbeab20078c3932e1e08cdb9e607fde34a96c9e4`
- goal: explicit canary routing while preserving the global V3.5 default
- result: only Black Death and D-Day can select the isolated V3.6 candidate route
- tests: History typecheck, targeted ESLint, 7 focused routing/plan tests
- invariants: no global route, production activation, or output mutation
- commit/tag: phase commit / `history-v3.6-production-canary-routing-baseline`
- next: measured timing for the two isolated canary workspaces

## Phase 2

- starting SHA: `aada46d5da13c0f4c0ab8d34aaad986680198ef1`
- goal: obtain authoritative measured timing for Black Death and D-Day in isolated canary workspaces
- result: superseded after authorization; the configured OpenAI-compatible route generated both isolated narration assets
- tests: initial sandbox attempt reached no provider (`curl` DNS exit 6); external authorized provider runs completed
- invariants: no estimated timing, V3.5 output change, or production activation
- commit/tag: `321fd6f6bce6eac462d3d0a5ac6a39636a22e7de` / `history-v3.6-production-canary-timing-gate`
- next: assess the measured durations against the production policy

## Phase 3

- starting SHA: `8a2e0db4b10a164784a2d78ec8343aeeac14fea6`
- goal: admit the two measured-timing canaries to V3.6 candidate planning
- result: `BLOCKED_BY_MEASURED_TIMING`; Black Death is `399857ms` and D-Day is `367634ms`, both below the configured `480000ms` History minimum
- tests: authoritative TTS generation (`gpt-4o-mini-tts` / `onyx`), ffprobe duration measurement, candidate-plan admission check, checksum verification, and ZIP integrity
- invariants: TTS calls 2; LLM/image/web/geocoding 0; no provisional timing accepted, V3.6 plan/render generated, V3.5 output change, or production activation
- commit/tag: pending measured-duration gate checkpoint
- next: human decides whether to revise the canonical scripts, authorize a scoped supported pacing change, or change the global duration policy
