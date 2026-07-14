# M2-008: Finish production speech, timing, visuals, and private rendering

Complete the production media path for reviewed German Class 5 standard lessons. This
task implements and verifies provider boundaries using mocks and local tools; it does not
authorize paid calls, uploads, or public publishing.

## Dependencies

M2-002 must be accepted before implementation. M2-004 through M2-007 may run in parallel,
but this task is not accepted until representative contracts from every content slice pass
the media path.

## Inspect first

- `packages/speech/src/educational-*`
- math speech orchestration and CLI commands
- `packages/math-rendering/src/`
- `packages/educational-renderer/src/` and its relevant ADRs/tests
- metadata, thumbnail, media-QA, and publish-dry-run boundaries
- the current natural-teacher sample report and chalk-animation failure evidence

## Required behavior

- Route canonical `math.tts`, timing reflow, visual assets, render, quality, metadata, and
  publish-dry-run tasks to their owning package implementations from M2-002.
- Generate provider requests only from reviewed, fact-locked German narration artifacts.
  Cache identity must include exact text, pronunciation policy, voice/model/profile,
  provider endpoint identity, speed, candidate selection, and producer version.
- Keep number, decimal, fraction, power, root, sign, and unit speech deterministic before
  provider invocation.
- Validate returned audio bytes, format, duration, channels, sample rate, silence, clipping,
  and identity before promotion. Reject swapped or truncated output.
- Reflow scenes and captions from measured audio while preserving scene order, fact locks,
  readable dwell time, and the approved lesson-duration range.
- Render deterministic semantic math visuals at 1920x1080. Validate formulas, diagrams,
  chart geometry, typography, safe areas, captions, and color-independent meaning.
- Reverify the historical chalk-animation failure against the current chalk renderer and
  focused tests. If it reproduces, repair progressive writing with deterministic timing or
  use an explicitly declared static-board strategy accepted by the visual profile. Never
  silently downgrade or report animation that was not rendered.
- Validate final media with local probes and bind binary hashes, duration, streams, frames,
  audio, captions, lesson identity, and quality evidence to workflow artifacts.
- Permit placeholder teacher artwork only for explicitly private/simulation media. Mark it
  non-publishable and preserve the hard public-release blocker.
- Generate localized metadata and a zero-mutation publish dry-run. Do not add a live publish
  command or consume channel credentials.

## Adversarial coverage

Test provider response transplant, stale cache identity, malformed/truncated audio,
duration drift, caption overflow, missing scene, fact/visual mismatch, renderer version
change, unsafe path/symlink, static/animated strategy mismatch, placeholder artwork marked
publish-ready, wrong locale, wrong lesson binary, and a dry-run attempting mutation.

## Verification

Run one focused educational speech test, one focused math-rendering or educational-renderer
test, and at most one affected-package typecheck. Use mocks and local fixtures only. Do not
run a paid provider or broad render suite without separate explicit approval.

## Acceptance

- Representative number, fraction, geometry, and data lessons traverse the media path with
  deterministic mock speech and valid local media evidence.
- Real provider execution is wired but authorization-gated and fully mock-tested.
- Resume reuses valid artifacts and invalidates only affected descendants.
- Placeholder assets cannot pass public publish readiness.
- Story/horror speech and rendering defaults are unchanged.
- Create the required Codex-run report. Do not commit unless requested.
