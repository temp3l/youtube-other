# History V3.2 Verification Ledger

Last updated: 2026-08-06

## Repository Baseline

- Current HEAD: `b052575d915ef80a578d99521c9b26ffeaaaeb6f`
- Pre-V3/V3.1 comparison commit:
  `2655c9e6e1471bca88ec0dc649fbf3a647c5ee89`
- Worktree before Milestone 0 edits: clean.

## Milestone 0 Commands and Results

Current Math characterization:

```bash
pnpm test:focused -- packages/math-education/src/task-registry.unit.test.ts
```

Result at current HEAD: **known baseline failure**. One of four tests fails;
one passes before bail. Exact failing test:

```text
mathematics task registry > binds every executable task through publish dry-run
and traverses only canonical operator state
```

The received deterministic topological order places `math.tts` and
`math.timing-reflow` before `math.visual-style` and `math.visual-assets`; the
constant asserted by the test lists the visual tasks first.

Pre-V3/V3.1 baseline command, run from an isolated archive of
`2655c9e6e1471bca88ec0dc649fbf3a647c5ee89`:

```bash
pnpm test:focused -- packages/math-education/src/task-registry.unit.test.ts
```

Result from the successful baseline reproduction earlier in this remediation:
**the same test and exact ordering difference fail**. Archive root:
`/tmp/history-v32-baseline-2655c9e-tXuFvN`.

A second reproducibility attempt used
`/tmp/history-v32-baseline-2655c9e-TJ6Uy1`. The archive initially lacked pnpm
workspace links and then package `dist` outputs; after the two permitted setup
repairs it stopped at unresolved `@mediaforge/speech` rather than reaching the
test. No further repair rerun was made. Static confirmation:

```bash
git diff --name-only 2655c9e6e1471bca88ec0dc649fbf3a647c5ee89..b052575d915ef80a578d99521c9b26ffeaaaeb6f -- packages/math-education packages/workflow-engine packages/speech packages/domain packages/shared vitest.unit.config.ts scripts/test-focused.sh pnpm-lock.yaml
```

Result: **no changed paths**. Classification: pre-existing stale ordering
assertion/constant, owned by Math Education and independent of History V3.2.

Focused V3.1 compatibility baseline:

```bash
pnpm test:focused -- packages/history/src/history-semantic-v31.unit.test.ts packages/history/src/history-editorial-v31.unit.test.ts packages/history/src/history-geo-v31.unit.test.ts packages/history/src/visual-planner-v31.unit.test.ts packages/history/src/history-review-bundle-v31.unit.test.ts apps/cli/src/history-commands.unit.test.ts
```

Result: **PASS**, 6 files and 24 tests.

## Known Input Facts Requiring Revalidation

- Current script spoken-word counts observed during planning: Napoleon 1,411;
  Fall of Rome 1,860; Black Death 1,117.
- Existing normalized metadata reports older counts/targets and does not bind the
  current script through a reproducible canonical/normalized hash pair.
- Current V3.1 plans report all 408 extracted claims unresolved.
- Per-episode unresolved claims: Napoleon 130, Fall of Rome 179, Black Death 99.
- V3.1 planned/target duration: Napoleon 783,333/600,000 ms; Fall of Rome
  1,031,667/600,000 ms; Black Death 618,889/600,000 ms.
- Current V3.1 approval artifacts can report a valid artifact lint while material
  validation blockers remain.
- Measured immutable narration audio has not been established.
- The three imported pack source hashes match import provenance and all current
  research-source registries have `approvedEvidenceCount: 0`.

## Generated Artifact Evidence

No V3.2 plans or bundles have been generated. Regeneration is prohibited until
Milestones 0-6 pass.

## Milestones 1-6 Implementation Gates

All gates below passed on 2026-08-06:

- M1: `history-v32-contracts.unit.test.ts`; CLI `-t V3.2`; History typecheck.
- M2: `history-timing-v32.unit.test.ts`; content-pack `-t 'duration metadata|no-op'`; History typecheck.
- M3: `history-provenance-v32.unit.test.ts`; V3.2 planner `-t provenance`; History typecheck.
- M4: `history-geo-v32.unit.test.ts`; semantic `-t 'diagram|map'`; History typecheck.
- M5: `history-editorial-v32.unit.test.ts`; `history-ratio-v32.unit.test.ts`; History typecheck.
- M6: `history-review-bundle-v32.unit.test.ts`; CLI `-t V3.2`; History typecheck.

Each focused test above was run with `pnpm test:focused -- <listed files>`;
every milestone also ran `pnpm --filter @mediaforge/history typecheck`.

The first scoped import attempt timed out twice in an approval path. A compiled
package invocation then revised only these canonical episode roots:

- `history-youtube-history-10-video-story-pack-02-napoleons-invasion-of-russia`
- `history-youtube-history-10-video-story-pack-03-fall-of-the-roman-empire`
- `history-youtube-history-10-video-story-pack-04-black-death`

## Milestone 7 Acceptance Evidence

Current commit: `b052575d915ef80a578d99521c9b26ffeaaaeb6f`.

- V3.1 regression gate: **PASS**, 6 files / 26 tests.
- Non-History characterization: **PASS**, 3 files / 6 tests.
- Math characterization: expected baseline failure at the recorded task-order
  assertion; ordering diff matches Milestone 0 exactly.
- History and CLI typechecks, focused ESLint on every changed source file, and
  History build: **PASS**.
- `unzip -t`, per-bundle `sha256sum -c`, plan-hash recomputation, contiguous
  timing allocation, redaction/no-local-path/no-secret scan, and no-symlink
  scan: **PASS**.

| Episode | Plan hash | Planned duration | Claims / unresolved | Final states |
| --- | --- | ---: | ---: | --- |
| Napoleon | `57e4776dc76a7a8e19c3dfd0e01acc2c86009a08d509a18c961653e9b8945d98` | 800,397 ms | 94 / 94 | structural/editorial reviewable; content/production blocked |
| Fall of Rome | `4c91ed1d3944e7bce71b2e1e556d1446321a00a5ade4d3a9b64f9082c4d84371` | 1,053,833 ms | 106 / 106 | structural/editorial reviewable; content/production blocked |
| Black Death | `bfcc609deddbe16c8bc5ce512d77e4e56f037c314807e5c0ca7c6b9f86bcb73d` | 634,864 ms | 96 / 96 | structural/editorial reviewable; content/production blocked |

All use `provisional-word-estimate`; each reports a timing warning within the
configured warning band. Content is blocked by `CLAIM_PROVENANCE_UNRESOLVED`;
production is additionally blocked by `TIMING_ESTIMATE_PROVISIONAL`.

Two same-epoch generations matched exactly:

```text
5eac2566b2b297097ed54bb6f53233c1c8f109b6df3c0e088fa47c598ea5f919  Napoleon ZIP
c184ea55e57d38edfaa3a1fc7cc2b3ae41116c21316e4db3a82a3fa2ff2661a7  Rome ZIP
11a961b7f57ac9e9fa3f02d85aeab969ff1e8dfaad03ab347e60c16727ba3a99  Black Death ZIP
8526441bb8e6ee45d08842466206ab3772aa8ca7bdbe76d1057656fbdc73fe8f  combined ZIP
```

Artifacts are under `artifacts/chatgpt-review/*-v3.2` and
`artifacts/chatgpt-review/history-approval-packs-v3.2`.

Reproduce final release checks with:

```bash
pnpm test:focused -- packages/history/src/history-semantic-v31.unit.test.ts packages/history/src/history-editorial-v31.unit.test.ts packages/history/src/history-geo-v31.unit.test.ts packages/history/src/visual-planner-v31.unit.test.ts packages/history/src/history-review-bundle-v31.unit.test.ts apps/cli/src/history-commands.unit.test.ts
pnpm test:focused -- packages/dark-truth/src/canonical-task-composition.unit.test.ts packages/strategic-reinvention/src/profile.unit.test.ts packages/dynamic-genre/src/base-profiles.unit.test.ts
pnpm test:focused -- packages/math-education/src/task-registry.unit.test.ts
pnpm --filter @mediaforge/history typecheck
pnpm --filter @mediaforge/cli typecheck
```

## Known Limitations

- Content eligibility may remain blocked without real human-verified claim
  evidence.
- Production eligibility must remain blocked without measured audio.
