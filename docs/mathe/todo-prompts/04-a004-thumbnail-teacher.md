Recommended model: GPT-5/Codex  
Recommended reasoning: high

# Implement A-004: thumbnail and teacher pilot behavior

Proceed only if A-003 is accepted. Implement only A-004.

Read `AGENTS.md`, `docs/ai-context/context-pack.md`, A-004/F-104, and inspect the actual
thumbnail renderer, teacher asset contract/manifest, metadata and publish preflight, their
fixtures/tests, and relevant rendering configuration. Do not modify generated assets
unless the human explicitly requests it.

Make deterministic simulation thumbnails fit all five supported locales using measured
font and formula bounds. Long text and formula overflow must reject. Keep the simulation
placeholder explicit and quality-classified. No boolean override may make placeholder art
publish-ready. Approved teacher assets must be hash-, license-, provenance-, pose-, and
dimension-bound, and the verified fact must be owned by the workflow so it cannot be
transplanted. Do not depend on horror thumbnail code or alter horror behavior.

If approved non-placeholder artwork or license/provenance evidence is unavailable, keep
public publishing blocked and clearly separate simulation acceptance from publish
acceptance. Do not fabricate approval.

Focused validation should cover the five-locale matrix, overflow negatives,
font/hash/teacher swaps, fact transplant, deterministic bytes, simulation versus publish
status, and a CLI dry-run packet. Run the affected test file first and at most one package
typecheck after focused tests pass.

Create `docs/reports/codex-runs/YYYY-MM-DD-a004-thumbnail-teacher.md`. Report whether
simulation and publish acceptance are independently satisfied, exact changed paths and
checks, asset/evidence blockers, commit hash or `not committed`, and the A-004 acceptance
recommendation.
