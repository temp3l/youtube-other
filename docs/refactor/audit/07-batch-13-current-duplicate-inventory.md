# Batch 13 Current Duplicate Inventory

Date: 2026-07-14. Commit: `2197009156ed909d8a4e61757ef7554bcab49770`.

This is the source-backed Batch 13 re-inventory. Searches covered executable
imports and callers, package and shell wrappers, Codex prompts, provider
construction/endpoints, path literals, prompt reads, file-existence cache
checks, production writers, state/approval/cache/batch writers, stale `dist`
imports, and legacy command strings. Generated/media trees were excluded.

## Classification

| Audit family | Current classification | Canonical owner / reason retained | Removal gate |
| --- | --- | --- | --- |
| D01 global identity | canonical plus thin adapter | `packages/domain`; shared normalizers adapt filesystem inputs | All public imports and legacy error-shape consumers migrate. |
| D02 local CLI/profile schemas | compatibility adapter | domain schemas plus capability applicability rules | Packaged CLI proves identical accepted values and support window is accepted. |
| D03 media envelopes | intentional capability strategy | domain envelope; image/render payloads add capability fields | Every cross-package payload uses the envelope. |
| D04 story quality states | intentional profile strategies | domain quality envelope with named Dark Truth sub-gates | All legacy status consumers use the mapped envelope. |
| D05 configuration | canonical plus bootstrap adapters | `packages/config`; provider injection remains at composition boundaries | Direct environment reads outside the documented bootstrap/secret allowlist are zero. |
| D06 paths | intentional profile layouts | shared containment primitives; episode/math/renderer layouts are distinct | Direct production writers are repository-owned and standalone packaging is proven. |
| D07 pipeline state | obsolete public compatibility surface | workflow engine is canonical; `PipelineContext`/`PipelineStep` are dormant, while `pipelineRuns` remains a legacy manifest read contract | Next-major/operator acceptance and no external type import reliance. |
| D08 batches | compatibility adapters plus provider strategies | workflow-engine lifecycle; subsystem stores preserve in-flight IDs and provider semantics | In-flight external batches expire/reconcile and compatibility JSON is accepted. |
| D09 prompt loader | active utility plus obsolete exports | modular compiler is canonical; `insertSectionBeforeMarker` is active, loader/cache aliases are dormant public compatibility | External prompt-template support window is explicitly closed; active insertion utility is moved without API break. |
| D10 story writers | compatibility debt | artifact repository is canonical; legacy reads/writes preserve historical story layouts | Migration dry-run is conflict-free for representative units and telemetry/support window is accepted. |
| D11 metadata shell | thin compatibility adapter | typed metadata task; shell only `exec`s CLI | Root alias support window closes. |
| D12 scene-image shell | thin compatibility adapter | canonical image task with sync/provider-batch strategies | Root/manual alias support window closes. |
| D13 provider debug output | canonical sink plus compatibility writers | shared redacting logger is canonical; story sidecars preserve documented debug filenames | Sidecar consumers migrate and redaction/retention compatibility is accepted. |
| D14 math renderers | intentional strategies | math-rendering owns semantics; educational-renderer owns deterministic transport | Recorded semantic-equivalence and packaging decision is approved. |
| D15 process execution | unresolved infrastructure strategy | process-runner is general; renderer adds RSS, kill grace, and renderer errors | Dependency boundary, metrics, cancellation, and packed renderer tests pass after delegation. |
| D16 filesystem primitives | intentional contained strategy | shared primitives are canonical; renderer keeps a standalone root-scoped implementation | Packed renderer can consume shared primitives without a dependency-cycle/package regression. |
| D17 bible/reference model | canonical plus legacy readers | Dark Truth versioned profile store; imports never promote legacy approval | Representative legacy migration is accepted and readers show no active fallback demand. |
| D18 approvals | canonical envelope plus profile policies | domain/workflow approval envelope; profile decisions remain intentional | Every publish compatibility path delegates through current canonical approval. |
| D19 command wrappers | thin adapters plus compatibility debt | CLI/engine tasks; npm and shell wrappers preserve telemetry/output contracts | Named alias support window and external callers are accepted. |
| D20 online/provider batch | intentional strategies | one logical task contract with online and provider-batch transports | Keep; removal is not applicable while both provider modes are supported. |

## Source findings

- No executable stale `@mediaforge/*/dist` import was found.
- Metadata and scene-image shell scripts contain no provider endpoint logic and
  delegate to the CLI.
- Provider constructors/endpoints remain in capability adapters; matches in
  planners/schemas are request contracts, not alternate application tasks.
- Direct story debug sidecars, subsystem batch/cache/state stores, episode
  manifests, and the legacy YouTube report writer are compatibility debt, not
  silently removed application owners.
- File-existence cache matches remain guarded by cache records, fingerprints,
  or validation; they are not sole workflow-success evidence.
- Codex/todo prompts contain historical command examples and are not executable
  callers. They remain source material until their owning task explicitly
  migrates or retires them.

## Removal record

No production symbol or path was removed. Consequently there is no rollback
operation beyond reverting this classification document. The retained surfaces
above name their canonical replacement and exact removal condition. This avoids
assuming that untracked external automation is absent.
