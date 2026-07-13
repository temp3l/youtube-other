Recommended model: GPT-5/Codex  
Recommended reasoning: high

# Execute A-009: independent provider-free pilot acceptance

Run this prompt in a fresh independent Codex session only after A-008 is accepted. This is
an audit/acceptance task, not authorization to repair defects.

Read `AGENTS.md`, `docs/ai-context/context-pack.md`, A-009, the current source and tests,
and the accepted A-001 through A-008 reports. Do not accept those reports as proof; use
them only to locate claimed behavior. Inspect the actual CLI entrypoint and test wrappers.

Use a fresh temporary pilot workspace outside tracked data. With network disabled and no
credentials, paid provider, remote renderer, upload, publication, or channel mutation,
execute the exact `M5-ZO-001-standard-de` vertical slice and five-locale locks. Verify
curriculum, three variants, independent math checks, German narration, five locales, mock
TTS, synchronized scenes, semantic visuals, FFmpeg-valid local media, metadata/playlists,
quality, state/resume, and publish dry-run. The second identical run must be cached with
stable eligible hashes and zero provider/mutation calls.

Also test missing/corrupt artifact, diagram/verifier/localization/batch failure,
interruption/resume, dry-publish zero mutation, and horror compatibility. Preserve failure
evidence without secrets or generated tracked assets.

Do not edit production, tests, fixtures, configuration, curriculum, or existing reports.
If a defect is found, stop, classify it, identify the smallest owning module and follow-up
prompt, and leave A-009 failed. Documentation-only audit evidence is allowed.

Create `docs/reports/codex-runs/YYYY-MM-DD-a009-independent-pilot.md` with exact commands,
pass/fail/skip counts, hashes needed to establish determinism, zero-call evidence, host
tool versions, risks, changed audit/report paths, and commit hash or `not committed`.
Conclude with an independent ACCEPT or FAIL; never use PARTIAL as release approval.
