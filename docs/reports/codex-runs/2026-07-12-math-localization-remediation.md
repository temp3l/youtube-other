# Math localization remediation

- Summary: R-006 accepted after adversarial review and repair. Fact locks cover objective, variant, examples, ordered steps, challenge/solutions, scenes, facts, and checks. Five locales emit deterministic display/speech with explicit regions, glossary TTS forms, locale metadata, post-localization verification, and versioned fingerprints. Legacy narration v1 parses but is never reusable; v2 validates schema plus embedded and lineage hashes.
- Changed paths: `packages/math-education/src/localization/{localization,display-verification,tts-lexicon,localization.unit.test}.ts`, `packages/math-education/src/orchestration/{workflow,pilot-simulation,workflow-store.unit.test}.ts`, backlog, plan report, and this report.
- Tests/checks: focused localization unit (8 passed); workflow compatibility unit (4 passed); exact five-locale Python integration (1 passed, 2 skipped); math package typecheck passed. The integration’s first run failed because `.venv` was absent; its one repair rerun passed using `/tmp/math-verifier-venv` installed offline from the hash-locked wheelhouse.
- Commit: baseline `ac21261`; HEAD `c97572e`; changes uncommitted.
- Risks: only three rollout-approved skills have reviewed glossary/topic mappings. R-007 is untouched.
- Follow-up: R-007 only—semantic SVG/cache, mock TTS, timing reflow, local Remotion, and FFmpeg QA; no paid providers or publishing.
