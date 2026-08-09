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
- result: `BLOCKED_BY_MEASURED_TIMING`; the configured OpenAI-compatible TTS route needs explicit authorization to transmit the two narration scripts externally
- tests: timing attempt reached no provider (`curl` DNS exit 6); checksum verification and ZIP integrity passed for the blocked-gate evidence bundle
- invariants: zero completed provider calls; no estimated timing, V3.6 plan, render, V3.5 output change, or production activation
- commit/tag: pending final timing-gate checkpoint
- next: human authorizes that exact payload/destination, or supplies authoritative measured timing for both episode IDs
