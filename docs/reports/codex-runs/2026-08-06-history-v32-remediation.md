# History V3.2 remediation

Summary: implemented opt-in V3.2 timing, provenance, semantic, editorial,
ratio, bundle, and CLI surfaces; corrected the three approved metadata entries;
imported only those episodes; generated deterministic individual and combined
review bundles.

Changed paths: `packages/history/src/*v32*`, History content-pack/importer
files, `apps/cli/src/history-commands.ts`, `apps/cli/src/index.ts`, three pack
stories, manifest, and `docs/history-v3.2/*`.

Tests: all Milestone 1-6 focused gates, V3.1 regression (26 tests), non-History
characterization (6 tests), affected typechecks, focused ESLint, build, ZIP,
checksum, redaction, symlink, plan-hash, timing, and deterministic-regeneration
checks passed. Math task-order test retains its baselined pre-existing failure.

Commit: `b052575d915ef80a578d99521c9b26ffeaaaeb6f`.

Unresolved risks: content approval awaits human-verified material evidence;
production approval awaits immutable measured narration audio.
