# YouTube Multi-Genre Enhancement Pack

This pack combines the recommended enhancements for:

- shared genre-aware production infrastructure;
- history;
- Dark Truth and other horror profiles;
- veronicaBenini.

The prompts are deliberately separated. Do **not** paste the complete pack into one Codex session.

## Recommended implementation order

| Goal | Prompt | Depends on | Main outcome |
|---:|---|---|---|
| 1 | `01-shared-genre-production-intelligence.md` | Existing repository | Opt-in shared contracts for scoring, retention, packaging, audio, provenance, analytics, approvals, and localization |
| 2 | `02-history-visual-planner-approval.md` | Goal 1 | History visual planning, maps/diagrams, shot density, approval gate |
| 3 | `03-history-visual-generation-rendering.md` | Goal 2 + approved plan | Generated/resolved assets and complete rendered history sequence |
| 4 | `04-history-editorial-research.md` | Goal 1 | Editorial pillars, topic scoring, research packs, factual integrity |
| 5 | `05-history-retention-audio.md` | Goal 4 | Retention validation, pronunciation, TTS preparation, sound plan |
| 6 | `06-history-packaging-publishing.md` | Goals 2–5 | Titles, thumbnails, chapters, series, provenance, disclosure, publishing gates |
| 7 | `07-history-analytics-localization.md` | Published history videos | H48/D7/D28 learning loop and guarded localization |
| 8 | `08-horror-narrative-reveal-continuity.md` | Goal 1 | Tension architecture, spoiler controls, story-bible/reference-image continuity |
| 9 | `09-horror-visual-sound-packaging-analytics.md` | Goal 8 | Horror pacing, sound design, spoiler-safe packaging, analytics |
| 10 | `10-veronicabenini-persona-voice-governance.md` | Goal 1 | Persona bible, claim integrity, cloned-voice authorization and TTS governance |
| 11 | `11-veronicabenini-content-visual-localization-analytics.md` | Goal 10 | Topic scoring, short/long content graph, visual brand, localization, packaging, analytics |

## Why this order

Goal 1 must come first so later prompts can reuse one opt-in foundation instead of independently creating duplicate scoring, approval, provenance, analytics, and localization systems.

History is then completed end to end. Horror and veronicaBenini are independent after Goal 1 and can be scheduled later. Goals 7, 9 analytics, and 11 analytics become most valuable after real videos have accumulated sufficient data.

## Before starting

1. Finish or pause any other Codex run touching the same repository.
2. Ensure the working tree is clean:
   ```bash
   git status
   ```
3. Commit the current baseline.
4. Run the repository’s normal type-check and focused tests once. Record existing failures so Codex does not misattribute them.
5. Copy this pack into the repository, for example:
   ```bash
   mkdir -p prompts/youtube-multigenre
   cp -R /path/to/pack/prompts/* prompts/youtube-multigenre/
   ```
6. Keep the pack itself unchanged. Let Codex add implementation notes elsewhere.

## Codex configuration

Recommended cost-conscious default:

```toml
model = "gpt-5.6-terra"
model_reasoning_effort = "high"
plan_mode_reasoning_effort = "high"
model_verbosity = "low"

[agents]
enabled = true
max_concurrent_threads_per_session = 1
interrupt_message = true
```

Run the prompts in **normal/goal mode**, not a separate plan-only mode. The prompts already require repository inspection, architecture reuse, implementation, testing, and completion reporting.

Reserve Sol/high for:
- a focused review of broad shared changes from Goal 1;
- unresolved renderer/provider integration in Goal 3;
- repeated architectural or test failures that Terra cannot resolve.

Do not restart an entire goal with Sol unless a targeted review fails.

## How to run each goal

Create a fresh Codex session for every prompt.

From the repository root, submit an instruction equivalent to:

```text
Implement prompts/youtube-multigenre/01-shared-genre-production-intelligence.md completely.

Inspect and reuse existing repository abstractions before editing. Keep all new
behavior additive, opt-in, and genre-profile gated. Run the required tests and
continue until the prompt’s completion criteria are satisfied. Do not implement
later goals in this session.
```

Change only the filename for the next goal.

A shorter `/goal` form is also acceptable when supported:

```text
/goal Implement prompts/youtube-multigenre/01-shared-genre-production-intelligence.md completely. Do not implement later goals.
```

## Branch and commit strategy

Use one branch per goal:

```bash
git switch main
git pull --ff-only
git switch -c feature/youtube-goal-01-shared-intelligence
```

After Codex finishes:

```bash
git status
git diff --stat
# Run tests manually if needed.
git add -A
git commit -m "feat(youtube): add shared genre production intelligence"
```

Merge or rebase the completed goal before creating the next dependent branch.

Recommended branch names:

```text
feature/youtube-goal-01-shared-intelligence
feature/youtube-goal-02-history-visual-planner
feature/youtube-goal-03-history-visual-rendering
feature/youtube-goal-04-history-editorial-research
feature/youtube-goal-05-history-retention-audio
feature/youtube-goal-06-history-packaging
feature/youtube-goal-07-history-analytics
feature/youtube-goal-08-horror-narrative
feature/youtube-goal-09-horror-production
feature/youtube-goal-10-veronica-persona-voice
feature/youtube-goal-11-veronica-content-system
```

Do not run two goals concurrently in the same working tree.

After Goal 1 is merged, independent horror and veronicaBenini work may run in separate Git worktrees. Sequential execution is safer and usually consumes fewer tokens because Codex sees a stable, already-integrated architecture.

## Mandatory checkpoints

### After Goal 1

Review the shared diff carefully. Confirm:

- no genre behavior changed by default;
- opt-in profile activation is explicit;
- existing cache keys and artifacts remain compatible;
- history, horror, math, veronicaBenini, and generic characterization tests pass;
- no oversized platform rewrite was introduced.

A focused Sol/high review is reasonable here if the shared diff is broad.

### After Goal 2

Generate the canonical Napoleon approval pack. Verify:

- expected 35–45 unique assets and 55–70 edited shots when runtime is 7–10 minutes;
- maps and logistics/attrition diagrams are required;
- the workflow stops in an awaiting-approval state;
- no media provider was called.

Approve the plan only after review using the implemented CLI and current plan hash.

### After Goal 3

Run the provider-mocked end-to-end test first. Then run one controlled real episode if desired. Verify:

- successful assets are cached and not regenerated;
- maps/diagrams use deterministic rendering where appropriate;
- asset provenance is complete;
- the final sequence covers the narration without gaps;
- non-history output is unchanged.

### After Goal 4

Approve the history research pack. Verify source quality, uncertainty classifications, chronology, pronunciation, and visual constraints.

### After Goal 5

Listen to generated history speech before continuing. Confirm headings do not enter narration, pacing remains natural, and established voice speed has not changed.

### After Goal 6

Review all three title/thumbnail hypotheses and publication disclosure. Confirm the title promise is fulfilled by the final script.

### After Goal 7

Do not approve global history-profile changes from one video. Require adequate sample sizes and several supporting episodes.

### After Goal 8

Use multiple horror fixtures. Confirm reference images and story bibles are first-class inputs and that reveal policies protect thumbnails, prompts, captions, and opening montages.

### After Goal 9

Listen to the sound plan/render. Confirm it uses contrast and silence rather than a continuous horror drone.

### After Goal 10

Manually verify cloned-voice authorization, allowed languages, revocation behavior, and fallback policy. Consent evidence must not enter public artifacts or logs.

### After Goal 11

Review every derived short for independent comprehension. Verify translations do not invent personal claims or strengthen unsupported advice.

## Suggested operating phases

### Phase A — Foundation

Run Goal 1.

Do not let it become a generic rewrite of the whole repository. Its job is to create minimal, reusable, opt-in contracts and services.

### Phase B — History production

Run Goals 2–6 sequentially.

Goal 7 can be implemented now, but its learning logic should remain inactive until real metrics meet configured sample thresholds.

### Phase C — Horror

Run Goals 8–9.

Preserve existing Dark Truth behavior through characterization tests. Story bibles and reference images remain mandatory where already configured.

### Phase D — veronicaBenini

Run Goals 10–11.

Do not generate cloned-voice audio until authorization and use-case checks pass.

### Phase E — Controlled rollout

For each genre:

1. Run one canonical fixture with mocked paid providers.
2. Run one real episode in dry-run/cost-estimate mode.
3. Review approval artifacts.
4. Generate one controlled production episode.
5. Compare artifacts and output against the pre-change baseline.
6. Enable the new profile behavior for future episodes only after acceptance.
7. Never automatically regenerate old episodes.

## Token and allowance control

- Use one Codex agent.
- Use a fresh session per goal.
- Keep `model_verbosity = "low"`.
- Run `/status` after every goal.
- Commit successful work before starting the next prompt.
- Ask for targeted fixes rather than repeating an entire prompt.
- Do not ask Codex to restate repository context already stored in implementation artifacts.
- Disable irrelevant MCP servers or integrations that inject context.
- Keep provider calls mocked until the corresponding approval and validation gates pass.
- Defer Goal 7 analytics and the analytics portions of Goals 9 and 11 if no real data exists yet.

## Minimum viable priority order when allowance is limited

Run:

1. Goal 1 — shared foundation
2. Goal 2 — history visual planner
3. Goal 3 — history rendering
4. Goal 4 — history research
5. Goal 5 — history retention/audio
6. Goal 8 — horror narrative/reveal/continuity
7. Goal 10 — veronica persona/voice governance

Then add packaging, analytics, and localization when allowance resets or production data becomes available.

## Failure handling

When a goal fails:

1. Do not paste the full prompt again immediately.
2. Keep the same branch and open a fresh session if context is polluted.
3. Provide the failing command, relevant error output, and the original prompt path.
4. Ask Codex to fix only the blocker and rerun the affected tests.
5. Escalate to Sol/high only after Terra/high fails on a well-scoped blocker.
6. Never bypass approval, licence, consent, provenance, or non-regression gates to make tests pass.

## Final acceptance criteria

The complete program is accepted when:

- all new behavior is opt-in and profile-gated;
- existing genres and old episodes remain unchanged by default;
- history produces research-backed, retention-aware, map/diagram-rich videos with approval before generation;
- horror preserves suspense, reveal timing, continuity, reference images, and story-bible rules;
- veronicaBenini preserves persona authenticity and cloned-voice authorization;
- titles/thumbnails are testable and promise-consistent;
- provenance, licensing, and synthetic-media disclosure are enforced;
- analytics produce evidence-based proposals rather than silent mutations;
- localization is gated by quality, authorization, cost, and operator approval;
- workflows are resumable, observable, deterministic where practical, and covered by tests.
